use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose, Engine as _};
use clipboard_master::{CallbackResult, ClipboardHandler, Master};
use diesel::dsl::date;
use image::GenericImageView;
use image::{ImageBuffer, RgbaImage};
use std::borrow::Cow;
use std::fs::File;
use std::io::Read;
use std::{
  collections::HashMap,
  sync::{Arc, Mutex},
};
use tauri::{self};
use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

use active_win_pos_rs::get_active_window;

use crate::cron_jobs;
use crate::models::Setting;
use crate::services::history_service;

#[derive(Debug)]
pub struct LanguageDetectOptions {
  pub should_detect_language: bool,
  pub min_lines_required: usize,
  pub enabled_languages: Vec<String>,
  pub prioritized_languages: Vec<String>,
  pub auto_mask_words_list: Vec<String>,
}

struct ClipboardMonitor<R>
where
  R: Runtime,
{
  // window: tauri::Window,
  app_handle: tauri::AppHandle<R>,
  running: Arc<Mutex<bool>>,
  clipboard_manager: Arc<Mutex<ClipboardManager>>,
}

impl<R> ClipboardMonitor<R>
where
  R: Runtime,
{
  fn new(
    app_handle: tauri::AppHandle<R>,
    running: Arc<Mutex<bool>>,
    clipboard_manager: Arc<Mutex<ClipboardManager>>,
  ) -> Self {
    Self {
      app_handle: app_handle,
      running,
      clipboard_manager,
    }
  }
}

impl<R> ClipboardHandler for ClipboardMonitor<R>
where
  R: Runtime,
{
  fn on_clipboard_change(&mut self) -> CallbackResult {
    let clipboard_manager = self.clipboard_manager.lock().unwrap();
    let app_settings = self.app_handle.state::<Mutex<HashMap<String, Setting>>>();
    let settings_map = app_settings.lock().unwrap();

    if let Some(setting) = settings_map.get("isHistoryEnabled") {
      if let Some(value_bool) = setting.value_bool {
        if !value_bool {
          println!("History capturing is disabled, no event will be send!");
          return CallbackResult::Next; // Return early if history capturing is disabled
        }
      }
    }

    let clipboard_text = clipboard_manager.read_text();

    history_service::increment_history_insert_count();

    let current_count = *history_service::HISTORY_INSERT_COUNT.lock().unwrap();

    if current_count >= 200 {
      history_service::reset_history_insert_count();
      cron_jobs::run_pending_jobs();
    }

    let mut do_refresh_clipboard: Option<String> = None;

    let should_auto_star_on_double_copy = settings_map
      .get("isAutoFavoriteOnDoubleCopyEnabled")
      .and_then(|s| s.value_bool)
      .unwrap_or(true);

    let copied_from_app = match get_active_window() {
      Ok(active_window) => Some(active_window.app_name),
      Err(()) => None,
    };

    if let Ok(mut text) = clipboard_text {
      text = text.trim().to_string();

      if !text.is_empty() {
        let mut is_excluded = false;
        if let Some(setting) = settings_map.get("isExclusionListEnabled") {
          if let Some(value_bool) = setting.value_bool {
            if value_bool {
              let exclusion_list: Vec<String> = settings_map
                .get("historyExclusionList")
                .and_then(|s| s.value_text.as_ref())
                .map_or(Vec::new(), |exclusion_list_text| {
                  exclusion_list_text.lines().map(String::from).collect()
                });

              is_excluded = text.lines().any(|line| {
                exclusion_list
                  .iter()
                  .any(|item| line.to_lowercase().contains(&item.to_lowercase()))
              });
            }
          }
        }

        if !is_excluded {
          if let Some(setting) = settings_map.get("isExclusionAppListEnabled") {
            if let Some(value_bool) = setting.value_bool {
              if value_bool {
                if let Some(app_name) = &copied_from_app {
                  let exclusion_app_list: Vec<String> = settings_map
                    .get("historyExclusionAppList")
                    .and_then(|s| s.value_text.as_ref())
                    .map_or(Vec::new(), |exclusion_list_text| {
                      exclusion_list_text.lines().map(String::from).collect()
                    });

                  is_excluded |= exclusion_app_list
                    .iter()
                    .any(|item| item.to_lowercase() == app_name.to_lowercase());
                }
              }
            }
          }
        }

        if !is_excluded {
          let should_detect_language = settings_map
            .get("isHistoryDetectLanguageEnabled")
            .and_then(|s| s.value_bool)
            .unwrap_or(true);

          let min_lines_required = settings_map
            .get("historyDetectLanguageMinLines")
            .and_then(|s| s.value_int)
            .unwrap_or(3) as usize;

          let enabled_languages: Vec<String> = settings_map
            .get("historyDetectLanguagesEnabledList")
            .and_then(|s| s.value_text.as_ref())
            .map_or(Vec::new(), |langs| {
              langs.split(',').map(String::from).collect()
            });

          let prioritized_languages: Vec<String> = settings_map
            .get("historyDetectLanguagesPrioritizedList")
            .and_then(|s| s.value_text.as_ref())
            .map_or(Vec::new(), |langs| {
              langs.split(',').map(String::from).collect()
            });

          let auto_mask_words_list = {
            if let Some(is_enabled) = settings_map
              .get("isAutoMaskWordsListEnabled")
              .and_then(|setting| setting.value_bool)
            {
              if is_enabled {
                settings_map
                  .get("autoMaskWordsList")
                  .and_then(|setting| setting.value_text.as_ref())
                  .map_or(Vec::new(), |exclusion_list_text| {
                    exclusion_list_text.lines().map(String::from).collect()
                  })
              } else {
                Vec::new()
              }
            } else {
              Vec::new()
            }
          };

          let detect_options = LanguageDetectOptions {
            should_detect_language,
            min_lines_required,
            enabled_languages,
            prioritized_languages,
            auto_mask_words_list,
          };

          do_refresh_clipboard = Some(history_service::add_clipboard_history_from_text(
            text,
            detect_options,
            should_auto_star_on_double_copy,
            copied_from_app,
          ));
        }
      }
    } else if let Ok(image_binary) = clipboard_manager.get_image_binary() {
      let mut is_app_excluded = false;

      if let Some(setting) = settings_map.get("isExclusionAppListEnabled") {
        if let Some(value_bool) = setting.value_bool {
          if value_bool {
            if let Some(app_name) = &copied_from_app {
              let exclusion_app_list: Vec<String> = settings_map
                .get("historyExclusionAppList")
                .and_then(|s| s.value_text.as_ref())
                .map_or(Vec::new(), |exclusion_list_text| {
                  exclusion_list_text.lines().map(String::from).collect()
                });

              is_app_excluded |= exclusion_app_list
                .iter()
                .any(|item| item.to_lowercase() == app_name.to_lowercase());
            }
          }
        }
      }

      if !is_app_excluded {
        do_refresh_clipboard = Some(history_service::add_clipboard_history_from_image(
          image_binary,
          should_auto_star_on_double_copy,
          copied_from_app,
        ));
      }
    }

    if let Some(refresh_value) = &do_refresh_clipboard {
      if refresh_value == "ok" {
        let _ = self.app_handle.emit_all(
          "clipboard://clipboard-monitor/update",
          format!("clipboard update"),
        );
      }
    }

    CallbackResult::Next
  }

  fn on_clipboard_error(&mut self, error: std::io::Error) -> CallbackResult {
    let _ = self.app_handle.emit_all(
      "clipboard://clipboard-monitor/update/error",
      error.to_string(),
    );
    eprintln!("Error: {}", error);
    CallbackResult::Next
  }
}

#[derive(Default)]
pub struct ClipboardManager {
  terminate_flag: Arc<Mutex<bool>>,
  running: Arc<Mutex<bool>>,
}

impl ClipboardManager {
  pub fn read_text(&self) -> Result<String, String> {
    let mut clipboard = Clipboard::new().unwrap();
    clipboard.get_text().map_err(|err| err.to_string())
  }

  pub fn write_text(&self, text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().unwrap();
    clipboard.set_text(text).map_err(|err| err.to_string())
  }

  pub fn read_image(&self) -> Result<String, String> {
    let mut clipboard = Clipboard::new().unwrap();
    let image = clipboard.get_image().map_err(|err| err.to_string())?;
    let tmp_dir = tempfile::Builder::new()
      .prefix("clipboard-img")
      .tempdir()
      .map_err(|err| err.to_string())?;
    let fname = tmp_dir.path().join("clipboard-img.png");

    let image2: RgbaImage = ImageBuffer::from_raw(
      image.width.try_into().unwrap(),
      image.height.try_into().unwrap(),
      image.bytes.into_owned(),
    )
    .unwrap();
    image2.save(fname.clone()).map_err(|err| err.to_string())?;
    let mut file = File::open(fname.clone()).unwrap();
    let mut buffer = vec![];
    file.read_to_end(&mut buffer).unwrap();
    let base64_str = general_purpose::STANDARD_NO_PAD.encode(buffer);
    Ok(base64_str)
  }

  pub fn get_image_binary(&self) -> Result<ImageData, String> {
    let mut clipboard = Clipboard::new().unwrap();
    let image_data = clipboard.get_image().map_err(|err| err.to_string())?;

    Ok(image_data)
  }

  pub fn read_image_binary(&self) -> Result<Vec<u8>, String> {
    let mut clipboard = Clipboard::new().unwrap();
    let image = clipboard.get_image().map_err(|err| err.to_string())?;
    let tmp_dir = tempfile::Builder::new()
      .prefix("clipboard-img")
      .tempdir()
      .map_err(|err| err.to_string())?;
    let fname = tmp_dir.path().join("clipboard-img.png");

    let image2: RgbaImage = ImageBuffer::from_raw(
      image.width.try_into().unwrap(),
      image.height.try_into().unwrap(),
      image.bytes.into_owned(),
    )
    .unwrap();
    image2.save(fname.clone()).map_err(|err| err.to_string())?;
    let mut file = File::open(fname.clone()).unwrap();
    let mut buffer = vec![];
    file.read_to_end(&mut buffer).unwrap();
    Ok(buffer)
  }

  pub fn write_image(&self, base64_image: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().unwrap();
    let decoded = general_purpose::STANDARD_NO_PAD
      .decode(base64_image)
      .map_err(|err| err.to_string())?;
    let img = image::load_from_memory(&decoded).map_err(|err| err.to_string())?;
    let pixels = img
      .pixels()
      .into_iter()
      .map(|(_, _, pixel)| pixel.0)
      .flatten()
      .collect::<Vec<_>>();
    let img_data = ImageData {
      height: img.height() as usize,
      width: img.width() as usize,
      bytes: Cow::Owned(pixels),
    };
    clipboard
      .set_image(img_data)
      .map_err(|err| err.to_string())?;
    Ok(())
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("clipboard")
    .setup(|app| {
      let clipboard_manager = Arc::new(Mutex::new(ClipboardManager::default()));

      let app_handle = app.app_handle();

      let running = Arc::new(Mutex::new(false));
      tauri::async_runtime::spawn(async move {
        let _ = Master::new(ClipboardMonitor::new(
          app_handle,
          running,
          Arc::clone(&clipboard_manager),
        ))
        .run();
      });
      Ok(())
    })
    .build()
}
