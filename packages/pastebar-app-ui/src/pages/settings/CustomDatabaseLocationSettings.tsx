import { useEffect, useState } from 'react'
import { dialog, invoke } from '@tauri-apps/api'
import { join } from '@tauri-apps/api/path'
import { settingsStore, settingsStoreAtom } from '~/store'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'

import { Icons } from '~/components/icons'
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Flex,
  Switch,
  Text,
  TextNormal,
} from '~/components/ui'

export default function CustomDatabaseLocationSettings() {
  const { t } = useTranslation()
  const {
    customDbPath,
    customDbPathError: storeCustomDbPathError,
    dbRelocationInProgress,
    validateCustomDbPath,
    applyCustomDbPath,
    revertToDefaultDbPath,
    relaunchApp,
  } = useAtomValue(settingsStoreAtom)

  // States for the "Change" functionality within CardContent
  const [selectedPathForChangeDialog, setSelectedPathForChangeDialog] = useState<
    string | null
  >(null)
  const [dbOperationForChangeDialog, setDbOperationForChangeDialog] = useState<
    'copy' | 'none'
  >('none')
  const [isApplyingChange, setIsApplyingChange] = useState(false)
  // isRevertingPath state is effectively handled by isProcessing when called from CardContent's revert button

  // General states
  const [isProcessing, setIsProcessing] = useState(false) // For toggle switch operations and CardContent button operations
  const [operationError, setOperationError] = useState<string | null>(null)
  const [validationErrorForChangeDialog, setValidationErrorForChangeDialog] = useState<
    string | null
  >(null)

  // Local state to control the expanded/collapsed state of the setup section when no custom path is set
  const [isSetupSectionExpanded, setIsSetupSectionExpanded] = useState(false)

  useEffect(() => {
    // Reset "Change" dialog state if customDbPath changes (e.g., reverted or set)
    setValidationErrorForChangeDialog(null)
    setSelectedPathForChangeDialog(null)
    setDbOperationForChangeDialog('none')
    // Reset setup section expansion when custom path is set/unset
    if (customDbPath) {
      setIsSetupSectionExpanded(false)
    }
  }, [customDbPath])

  // Effect to react to validation errors from the store for the "Change" dialog
  useEffect(() => {
    const state = settingsStore.getState()
    if (
      selectedPathForChangeDialog &&
      storeCustomDbPathError &&
      !state.isCustomDbPathValid
    ) {
      setValidationErrorForChangeDialog(storeCustomDbPathError)
    } else if (state.isCustomDbPathValid) {
      // Clear validation error if store says path is valid (e.g. after successful validation for the selectedPathForChangeDialog)
      setValidationErrorForChangeDialog(null)
    }
  }, [storeCustomDbPathError, selectedPathForChangeDialog])

  // Renamed from handleBrowse, used by "Change" button in CardContent
  const handleBrowseForChangeDialog = async () => {
    setOperationError(null)
    setValidationErrorForChangeDialog(null)
    try {
      const selected = await dialog.open({
        directory: true,
        multiple: false,
        title: t('Select Data Folder', { ns: 'settings' }),
      })
      if (typeof selected === 'string') {
        const status: any = await invoke('cmd_check_custom_data_path', {
          pathStr: selected,
        })
        let finalPath = selected

        if (status === 'HasPastebarDataSubfolder') {
          // Use existing pastebar-data subfolder
          finalPath = await join(selected, 'pastebar-data')
          await dialog.message(
            t(
              'Found existing "pastebar-data" folder. The application will use this folder to store data.',
              { ns: 'settings' }
            )
          )
        } else if (status === 'NotEmpty') {
          const confirmSubfolder = await dialog.confirm(
            t(
              'The selected folder is not empty and does not contain PasteBar data files. Do you want to create a "pastebar-data" subfolder to store the data?',
              { ns: 'settings' }
            )
          )
          if (confirmSubfolder) {
            finalPath = await join(selected, 'pastebar-data')
            // Create the directory after user confirmation
            try {
              await invoke('cmd_create_directory', { pathStr: finalPath })
            } catch (error) {
              console.error('Failed to create pastebar-data directory:', error)
              setOperationError(
                t('Failed to create directory. Please check permissions and try again.', {
                  ns: 'settings',
                })
              )
              return
            }
          } else {
            return
          }
        } else if (status === 'IsPastebarDataAndNotEmpty') {
          await dialog.message(
            t(
              'This folder already contains PasteBar data. The application will use this existing data after restart.',
              { ns: 'settings' }
            )
          )
        }

        setSelectedPathForChangeDialog(finalPath)
        if (finalPath !== customDbPath) {
          await validateCustomDbPath(finalPath) // Validation result will be reflected in storeCustomDbPathError
        }
      }
    } catch (error) {
      console.error('Error handling directory selection for change:', error)
      setOperationError(
        t('An error occurred during directory processing.', { ns: 'settings' })
      )
    }
  }

  // Renamed from handleApply, used by "Apply and Restart" button in CardContent
  const handleApplyChangeDialog = async () => {
    if (!selectedPathForChangeDialog || selectedPathForChangeDialog === customDbPath) {
      setOperationError(
        t('Please select a new directory different from the current one.', {
          ns: 'settings',
        })
      )
      return
    }
    setIsApplyingChange(true)
    setIsProcessing(true) // General processing state
    setOperationError(null)
    setValidationErrorForChangeDialog(null)

    // Ensure validation is re-checked or use existing validation state
    await validateCustomDbPath(selectedPathForChangeDialog)
    const currentStoreState = settingsStore.getState()

    if (!currentStoreState.isCustomDbPathValid) {
      setValidationErrorForChangeDialog(
        currentStoreState.customDbPathError ||
          t('Invalid directory selected.', { ns: 'settings' })
      )
      setIsApplyingChange(false)
      setIsProcessing(false)
      return
    }

    let confirmMessage: string
    if (dbOperationForChangeDialog === 'none') {
      confirmMessage = t(
        'Are you sure you want to set "{{path}}" as the new data folder? The application will restart.',
        {
          ns: 'settings',
          path: selectedPathForChangeDialog,
        }
      )
    } else {
      confirmMessage = t(
        'Are you sure you want to {{operation}} the database to "{{path}}"? The application will restart.',
        {
          ns: 'settings',
          operation: t(dbOperationForChangeDialog, { ns: 'settings' }),
          path: selectedPathForChangeDialog,
        }
      )
    }

    const confirmed = await dialog.confirm(confirmMessage)
    if (confirmed) {
      try {
        await applyCustomDbPath(selectedPathForChangeDialog, dbOperationForChangeDialog)
        relaunchApp()
      } catch (error: any) {
        // Attempt rollback on failure
        try {
          await revertToDefaultDbPath()
        } catch (_) {
          // Ignore rollback errors
        }
        setOperationError(
          error.message ||
            t('Failed to apply custom database location.', { ns: 'settings' })
        )
      } finally {
        setIsApplyingChange(false)
        setIsProcessing(false)
      }
    } else {
      setIsApplyingChange(false)
      setIsProcessing(false)
    }
  }

  // Internal function for reverting, called by toggle or button
  const revertToDefaultWithConfirmationInternal = async () => {
    setOperationError(null)
    const confirmed = await dialog.confirm(
      t('ConfirmRevertToDefaultDbPathMessage', { ns: 'settings' })
    )

    if (!confirmed) {
      return false // Indicates cancellation
    }

    setIsProcessing(true)
    try {
      await revertToDefaultDbPath()
      relaunchApp()
      return true // Indicates success
    } catch (error: any) {
      setOperationError(
        error.message ||
          t('Failed to revert to default database location.', { ns: 'settings' })
      )
      return false // Indicates failure
    } finally {
      setIsProcessing(false)
    }
  }

  // Called by "Revert to Default" button in CardContent
  const handleRevertFromContent = async () => {
    await revertToDefaultWithConfirmationInternal()
  }

  // Handle initial setup path selection
  const handleSetupPathSelection = async () => {
    setOperationError(null)
    setValidationErrorForChangeDialog(null)
    try {
      const selected = await dialog.open({
        directory: true,
        multiple: false,
        title: t('Select Data Folder', { ns: 'settings' }),
      })
      if (typeof selected === 'string') {
        const status: any = await invoke('cmd_check_custom_data_path', {
          pathStr: selected,
        })
        let finalPath = selected

        if (status === 'HasPastebarDataSubfolder') {
          // Use existing pastebar-data subfolder
          finalPath = await join(selected, 'pastebar-data')
          await dialog.message(
            t(
              'Found existing "pastebar-data" folder. The application will use this folder to store data.',
              { ns: 'settings' }
            )
          )
        } else if (status === 'NotEmpty') {
          const confirmSubfolder = await dialog.confirm(
            t(
              'The selected folder is not empty and does not contain PasteBar data files. Do you want to create a "pastebar-data" subfolder to store the data?',
              { ns: 'settings' }
            )
          )
          if (confirmSubfolder) {
            finalPath = await join(selected, 'pastebar-data')
            // Create the directory after user confirmation
            try {
              await invoke('cmd_create_directory', { pathStr: finalPath })
            } catch (error) {
              console.error('Failed to create pastebar-data directory:', error)
              setOperationError(
                t('Failed to create directory. Please check permissions and try again.', {
                  ns: 'settings',
                })
              )
              return
            }
          } else {
            return
          }
        } else if (status === 'IsPastebarDataAndNotEmpty') {
          await dialog.message(
            t(
              'This folder already contains PasteBar data. The application will use this existing data after restart.',
              { ns: 'settings' }
            )
          )
        }

        setSelectedPathForChangeDialog(finalPath)
        await validateCustomDbPath(finalPath) // Validation result will be reflected in storeCustomDbPathError
      }
    } catch (error) {
      console.error('Error handling directory selection for setup:', error)
      setOperationError(
        t('An error occurred during directory processing.', { ns: 'settings' })
      )
    }
  }

  // Handle applying the initial setup
  const handleApplySetup = async () => {
    if (!selectedPathForChangeDialog) {
      setOperationError(t('Please select a directory first.', { ns: 'settings' }))
      return
    }
    setIsApplyingChange(true)
    setIsProcessing(true)
    setOperationError(null)
    setValidationErrorForChangeDialog(null)

    // Ensure validation is re-checked
    await validateCustomDbPath(selectedPathForChangeDialog)
    const currentStoreState = settingsStore.getState()

    if (!currentStoreState.isCustomDbPathValid) {
      setValidationErrorForChangeDialog(
        currentStoreState.customDbPathError ||
          t('Invalid directory selected.', { ns: 'settings' })
      )
      setIsApplyingChange(false)
      setIsProcessing(false)
      return
    }

    let confirmMessage: string
    if (dbOperationForChangeDialog === 'none') {
      confirmMessage = t(
        'Are you sure you want to set "{{path}}" as the new data folder? The application will restart.',
        {
          ns: 'settings',
          path: selectedPathForChangeDialog,
        }
      )
    } else {
      confirmMessage = t(
        'Are you sure you want to {{operation}} the database to "{{path}}"? The application will restart.',
        {
          ns: 'settings',
          operation: t(dbOperationForChangeDialog, { ns: 'settings' }),
          path: selectedPathForChangeDialog,
        }
      )
    }

    const confirmed = await dialog.confirm(confirmMessage)
    if (confirmed) {
      try {
        await applyCustomDbPath(selectedPathForChangeDialog, dbOperationForChangeDialog)
        relaunchApp()
      } catch (error: any) {
        try {
          await revertToDefaultDbPath()
        } catch (_) {}
        setOperationError(
          error.message ||
            t('Failed to apply custom database location.', { ns: 'settings' })
        )
      } finally {
        setIsApplyingChange(false)
        setIsProcessing(false)
      }
    } else {
      setIsApplyingChange(false)
      setIsProcessing(false)
    }
  }

  // Function to choose and set custom path, called when toggle is turned ON
  const chooseAndSetCustomPath = async () => {
    setOperationError(null)
    setIsProcessing(true)
    let pathSuccessfullySet = false

    try {
      const selected = await dialog.open({
        directory: true,
        multiple: false,
        title: t('Select Data Folder', { ns: 'settings' }),
      })

      if (typeof selected === 'string') {
        let finalPath = selected
        const status: any = await invoke('cmd_check_custom_data_path', {
          pathStr: selected,
        })

        if (status === 'HasPastebarDataSubfolder') {
          // Use existing pastebar-data subfolder
          finalPath = await join(selected, 'pastebar-data')
          await dialog.message(
            t(
              'Found existing "pastebar-data" folder. The application will use this folder to store data.',
              { ns: 'settings' }
            )
          )
        } else if (status === 'NotEmpty') {
          const confirmSubfolder = await dialog.confirm(
            t(
              'The selected folder is not empty and does not contain PasteBar data files. Do you want to create a "pastebar-data" subfolder to store the data?',
              { ns: 'settings' }
            )
          )
          if (confirmSubfolder) {
            finalPath = await join(selected, 'pastebar-data')
            // Create the directory after user confirmation
            try {
              await invoke('cmd_create_directory', { pathStr: finalPath })
            } catch (error) {
              console.error('Failed to create pastebar-data directory:', error)
              setOperationError(
                t('Failed to create directory. Please check permissions and try again.', {
                  ns: 'settings',
                })
              )
              setIsProcessing(false)
              return false
            }
          } else {
            setIsProcessing(false)
            return false // User cancelled subfolder creation
          }
        } else if (status === 'IsPastebarDataAndNotEmpty') {
          await dialog.message(
            t(
              'This folder already contains PasteBar data. The application will use this existing data after restart.',
              { ns: 'settings' }
            )
          )
        }

        await validateCustomDbPath(finalPath)
        const currentStoreState = settingsStore.getState()

        if (!currentStoreState.isCustomDbPathValid) {
          setOperationError(
            currentStoreState.customDbPathError ||
              t('Invalid directory selected.', { ns: 'settings' })
          )
          setIsProcessing(false)
          return false // Validation failed
        }

        const confirmed = await dialog.confirm(
          t(
            'Are you sure you want to set "{{path}}" as the new data folder? The application will restart.',
            { ns: 'settings', path: finalPath }
          )
        )

        if (confirmed) {
          try {
            await applyCustomDbPath(finalPath, 'none') // 'none' for initial setup
            relaunchApp()
            pathSuccessfullySet = true // Path will be set by store, app restarts
          } catch (error) {
            try {
              await revertToDefaultDbPath()
            } catch (_) {}
            setOperationError(
              (error as any).message ||
                t('Failed to apply custom database location.', { ns: 'settings' })
            )
          }
        }
      }
    } catch (error) {
      console.error('Error choosing custom DB path:', error)
      setOperationError(
        t('An error occurred during directory selection or setup.', {
          ns: 'settings',
        })
      )
    } finally {
      setIsProcessing(false)
    }
    return pathSuccessfullySet // This return might not be directly used if app restarts
  }

  const handleToggle = async (checked: boolean) => {
    if (!customDbPath) {
      // If no custom path is set, toggle the setup section expansion
      setIsSetupSectionExpanded(checked)
      if (!checked) {
        // When closing, reset any setup-related states
        setOperationError(null)
        setSelectedPathForChangeDialog(null)
        setDbOperationForChangeDialog('none')
      }
    }
    // If customDbPath is already set, the toggle is disabled so this won't be called
  }

  const isLoading = dbRelocationInProgress || isProcessing || isApplyingChange
  const currentPathDisplay = customDbPath || t('Default', { ns: 'settings' })
  const isPathUnchangedForChangeDialog = selectedPathForChangeDialog === customDbPath

  // Determine switch state: ON if custom path is set OR if setup section is expanded
  const isSwitchChecked = !!customDbPath || isSetupSectionExpanded
  // Disable switch only when loading or when custom path is already set (to prevent toggling off)
  const isSwitchDisabled = isLoading || !!customDbPath

  return (
    <Box className="animate-in fade-in max-w-xl mt-4">
      <Card
        className={`${
          !customDbPath && !isSetupSectionExpanded
            ? 'opacity-80 bg-gray-100 dark:bg-gray-900/80'
            : ''
        }`}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <CardTitle className="animate-in fade-in text-md font-medium">
            {t('Custom Application Data Location', { ns: 'settings' })}
          </CardTitle>
          {!customDbPath && (
            <Switch
              checked={isSwitchChecked}
              onCheckedChange={handleToggle}
              disabled={isSwitchDisabled}
            />
          )}
        </CardHeader>

        {!!customDbPath ? ( // Content visible only if customDbPath is set
          <CardContent>
            <Text className="text-sm text-muted-foreground">
              {t(
                'Custom data location is active. You can change it or revert to the default location. Changes require an application restart.',
                { ns: 'settings' }
              )}
            </Text>

            <div className="space-y-4 mt-4">
              <div>
                <Text className="text-sm text-muted-foreground">
                  {t('Current data folder', { ns: 'settings' })}:
                </Text>
                <Text className="text-sm font-semibold text-foreground mt-1 break-all">
                  {currentPathDisplay}
                </Text>
              </div>

              {selectedPathForChangeDialog && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border">
                  <Text className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {t('Selected new data folder for change', { ns: 'settings' })}:{' '}
                  </Text>
                  <Text className="text-sm text-blue-700 dark:text-blue-200 break-all">
                    {selectedPathForChangeDialog}
                  </Text>
                </div>
              )}

              {validationErrorForChangeDialog && (
                <Text className="text-sm text-red-500">
                  {validationErrorForChangeDialog}
                </Text>
              )}

              <Flex className="gap-3">
                <Button
                  onClick={handleBrowseForChangeDialog}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1 h-10"
                >
                  {dbRelocationInProgress && !isApplyingChange && !isProcessing ? (
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('Change Custom Data Folder...', { ns: 'settings' })}
                </Button>

                <Button
                  onClick={handleRevertFromContent}
                  disabled={isLoading}
                  variant="secondary"
                  className="flex-1 h-10 bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 text-white border-yellow-500 dark:border-yellow-600"
                >
                  {isProcessing && !isApplyingChange ? (
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('Revert to Default', { ns: 'settings' })}
                </Button>
              </Flex>

              {selectedPathForChangeDialog && (
                <Flex className="items-center space-x-4">
                  <Text className="text-sm">
                    {t('Operation when applying new path', { ns: 'settings' })}:
                  </Text>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dbOperationForChange"
                      value="none"
                      checked={dbOperationForChangeDialog === 'none'}
                      onChange={() => setDbOperationForChangeDialog('none')}
                      disabled={isLoading}
                      className="form-radio accent-primary"
                    />
                    <TextNormal size="sm">
                      {t('Use new location', { ns: 'settings' })}
                    </TextNormal>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dbOperationForChange"
                      value="copy"
                      checked={dbOperationForChangeDialog === 'copy'}
                      onChange={() => setDbOperationForChangeDialog('copy')}
                      disabled={isLoading}
                      className="form-radio accent-primary"
                    />
                    <TextNormal size="sm">
                      {t('Copy data', { ns: 'settings' })}
                    </TextNormal>
                  </label>
                </Flex>
              )}

              {operationError && (
                <Text className="text-sm text-red-500">{operationError}</Text>
              )}

              {selectedPathForChangeDialog && (
                <Button
                  onClick={handleApplyChangeDialog}
                  disabled={
                    isLoading ||
                    !selectedPathForChangeDialog ||
                    isPathUnchangedForChangeDialog ||
                    !!validationErrorForChangeDialog
                  }
                  className="w-full h-10"
                >
                  {isApplyingChange ? (
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('Apply and Restart', { ns: 'settings' })}
                </Button>
              )}
              <Text className="text-xs text-muted-foreground pt-2">
                {t(
                  'Changing the database location requires an application restart to take effect.',
                  { ns: 'settings' }
                )}
              </Text>
            </div>
          </CardContent>
        ) : isSetupSectionExpanded ? (
          // Setup content visible when no custom path is set but section is expanded
          <CardContent>
            <Text className="text-sm text-muted-foreground mb-4">
              {t(
                'Select a custom location to store your application data instead of the default location.',
                { ns: 'settings' }
              )}
            </Text>

            <div className="space-y-4">
              {selectedPathForChangeDialog && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border">
                  <Text className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {t('Selected data folder', { ns: 'settings' })}:{' '}
                  </Text>
                  <Text className="text-sm text-blue-700 dark:text-blue-200 break-all">
                    {selectedPathForChangeDialog}
                  </Text>
                </div>
              )}

              {validationErrorForChangeDialog && (
                <Text className="text-sm text-red-500">
                  {validationErrorForChangeDialog}
                </Text>
              )}

              <Button
                onClick={handleSetupPathSelection}
                disabled={isLoading}
                variant="outline"
                className="w-full h-10"
              >
                {isProcessing && !isApplyingChange ? (
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {selectedPathForChangeDialog
                  ? t('Change Selected Folder...', { ns: 'settings' })
                  : t('Select Data Folder...', { ns: 'settings' })}
              </Button>

              {selectedPathForChangeDialog && (
                <Flex className="items-center space-x-4">
                  <Text className="text-sm">
                    {t('Operation when applying new path', { ns: 'settings' })}:
                  </Text>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dbOperationForSetup"
                      value="none"
                      checked={dbOperationForChangeDialog === 'none'}
                      onChange={() => setDbOperationForChangeDialog('none')}
                      disabled={isLoading}
                      className="form-radio accent-primary"
                    />
                    <TextNormal size="sm">
                      {t('Use new location', { ns: 'settings' })}
                    </TextNormal>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dbOperationForSetup"
                      value="copy"
                      checked={dbOperationForChangeDialog === 'copy'}
                      onChange={() => setDbOperationForChangeDialog('copy')}
                      disabled={isLoading}
                      className="form-radio accent-primary"
                    />
                    <TextNormal size="sm">
                      {t('Copy data', { ns: 'settings' })}
                    </TextNormal>
                  </label>
                </Flex>
              )}

              {operationError && (
                <Text className="text-sm text-red-500">{operationError}</Text>
              )}

              {selectedPathForChangeDialog && (
                <Button
                  onClick={handleApplySetup}
                  disabled={
                    isLoading ||
                    !selectedPathForChangeDialog ||
                    !!validationErrorForChangeDialog
                  }
                  className="w-full h-10"
                >
                  {isApplyingChange ? (
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('Apply and Restart', { ns: 'settings' })}
                </Button>
              )}

              <Text className="text-xs text-muted-foreground pt-2">
                {t(
                  'Setting a custom database location requires an application restart to take effect.',
                  { ns: 'settings' }
                )}
              </Text>
            </div>
          </CardContent>
        ) : (
          // Default collapsed state when no custom path is set
          <CardContent>
            <Text className="text-sm text-muted-foreground">
              {t(
                'Enable custom data location to store application data in a directory of your choice instead of the default location.',
                { ns: 'settings' }
              )}
            </Text>
          </CardContent>
        )}
      </Card>
    </Box>
  )
}
