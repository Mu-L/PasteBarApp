import { useEffect, useState } from 'react'
import { closestCenter, DndContext } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { settingsStoreAtom, uiStoreAtom } from '~/store'
import { useAtomValue } from 'jotai'
import { Grip } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import AutoSize from 'react-virtualized-auto-sizer'

import {
  arraysEqual,
  isStringArrayEmpty,
  maskValue,
  trimAndRemoveExtraNewlines,
} from '~/lib/utils'

import Spacer from '~/components/atoms/spacer'
import SimpleBar from '~/components/libs/simplebar-react'
import InputField from '~/components/molecules/input'
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CheckBoxFilter,
  Flex,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Text,
} from '~/components/ui'

import { useDebounce } from '~/hooks/use-debounce'

import TextArea from '../../components/molecules/textarea'

interface SortableItemProps {
  id: string
  language: string
}
function SortableItem({ id, language }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isDragging ? 'z-100 opacity-70' : 'z-auto opacity-100'}
    >
      <Flex className="items-center justify-between p-2 border rounded mb-2 dark:bg-slate-900 bg-slate-50">
        <Flex className="items-center justify-center ml-2">
          <Text>{language}</Text>
        </Flex>
        <Button variant="ghost" size="sm" className="opacity-40 hover:opacity-90">
          <Grip size={20} />
        </Button>
      </Flex>
    </div>
  )
}

export default function ClipboardHistorySettings() {
  const {
    isHistoryEnabled,
    setIsHistoryEnabled,
    isHistoryAutoUpdateOnCaputureEnabled,
    setIsHistoryAutoUpdateOnCaputureEnabled,
    setIsExclusionListEnabled,
    setIsExclusionAppListEnabled,
    historyExclusionList,
    historyExclusionAppList,
    autoMaskWordsList,
    isExclusionListEnabled,
    isExclusionAppListEnabled,
    setHistoryExclusionList,
    setHistoryExclusionAppList,
    setAutoMaskWordsList,
    isAutoMaskWordsListEnabled,
    isAutoPreviewLinkCardsEnabled,
    setIsAutoPreviewLinkCardsEnabled,
    isAutoGenerateLinkCardsEnabled,
    setIsAutoGenerateLinkCardsEnabled,
    isAutoFavoriteOnDoubleCopyEnabled,
    setIsAutoFavoriteOnDoubleCopyEnabled,
    setIsAutoMaskWordsListEnabled,
    setHistoryDetectLanguagesEnabledList,
    setHistoryDetectLanguagesPrioritizedList,
    setIsHistoryDetectLanguageEnabled,
    isHistoryDetectLanguageEnabled,
    historyDetectLanguagesEnabledList,
    historyDetectLanguagesPrioritizedList,
    historyDetectLanguageMinLines,
    setHistoryDetectLanguageMinLines,
    isAutoClearSettingsEnabled,
    setIsAutoClearSettingsEnabled,
    autoClearSettingsDuration,
    setAutoClearSettingsDuration,
    autoClearSettingsDurationType,
    setAutoClearSettingsDurationType,
    isAppReady,
    CONST: { APP_DETECT_LANGUAGES_SUPPORTED: languageList },
  } = useAtomValue(settingsStoreAtom)

  const { returnRoute } = useAtomValue(uiStoreAtom)
  const { t } = useTranslation()

  const [exclusionListValue, setExclusionListValue] = useState('')
  const [exclusionAppListValue, setExclusionAppListValue] = useState('')
  const [autoMaskListValue, setAutoMaskListValue] = useState('')
  const [isAutoMaskWordsTextAreaInFocus, setIsAutoMaskWordsTextAreaInFocus] =
    useState(false)

  const debouncedExclusionListValue = useDebounce(exclusionListValue, 300)
  const debouncedExclusionAppListValue = useDebounce(exclusionAppListValue, 300)
  const debouncedAutoMaskListValue = useDebounce(autoMaskListValue, 300)

  const [prioritizedLanguages, setPrioritizedLanguages] = useState<string[]>([])

  useEffect(() => {
    if (
      isStringArrayEmpty(historyDetectLanguagesPrioritizedList) &&
      !isStringArrayEmpty(historyDetectLanguagesEnabledList)
    ) {
      setPrioritizedLanguages(historyDetectLanguagesEnabledList)
    } else if (!isStringArrayEmpty(historyDetectLanguagesPrioritizedList)) {
      setPrioritizedLanguages(historyDetectLanguagesPrioritizedList)
    }
  }, [historyDetectLanguagesEnabledList, historyDetectLanguagesPrioritizedList])

  useEffect(() => {
    if (isAppReady) {
      setHistoryExclusionList(trimAndRemoveExtraNewlines(debouncedExclusionListValue))
    }
  }, [debouncedExclusionListValue, isAppReady])

  useEffect(() => {
    if (isAppReady) {
      setHistoryExclusionAppList(
        trimAndRemoveExtraNewlines(debouncedExclusionAppListValue)
      )
    }
  }, [debouncedExclusionAppListValue, isAppReady])

  useEffect(() => {
    if (isAppReady) {
      setAutoMaskWordsList(trimAndRemoveExtraNewlines(debouncedAutoMaskListValue))
    }
  }, [debouncedAutoMaskListValue, isAppReady])

  useEffect(() => {
    if (isAppReady) {
      setExclusionListValue(historyExclusionList)
      setExclusionAppListValue(historyExclusionAppList)
      setAutoMaskListValue(autoMaskWordsList)
    }
  }, [isAppReady])

  const durationOptionsMapByType: {
    readonly [key: string]: readonly number[]
  } = {
    days: [1, 2, 3, 4, 5, 6],
    weeks: [1, 2, 3],
    months: [1, 3, 6, 8],
    year: [1, 2],
  }

  function getAutoClearSettingDurationLabel(
    autoClearSettingsDuration: number,
    autoClearSettingsDurationType: string
  ) {
    const durationTypeMap: Record<string, string> = {
      days:
        autoClearSettingsDuration === 1
          ? t('Day', { ns: 'calendar' })
          : t('Days', { ns: 'calendar' }),
      weeks:
        autoClearSettingsDuration === 1
          ? t('Week', { ns: 'calendar' })
          : t('Weeks', { ns: 'calendar' }),
      months:
        autoClearSettingsDuration === 1
          ? t('Month', { ns: 'calendar' })
          : t('Months', { ns: 'calendar' }),
      year:
        autoClearSettingsDuration === 1
          ? t('Year', { ns: 'calendar' })
          : t('Years', { ns: 'calendar' }),
    }
    const durationTypeLabel = durationTypeMap[autoClearSettingsDurationType]

    return `${autoClearSettingsDuration} ${durationTypeLabel}`
  }

  return (
    <AutoSize disableWidth>
      {({ height }) => {
        return (
          height && (
            <Box className="p-4 py-6 select-none min-w-[320px]">
              <Box className="text-xl my-2 mx-2 flex items-center justify-between">
                <Text className="light">
                  {t('Clipboard History Settings', { ns: 'settings' })}
                </Text>
                <Link to={returnRoute} replace>
                  <Button
                    variant="ghost"
                    className="text-sm bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                    size="sm"
                  >
                    {t('Back', { ns: 'common' })}
                  </Button>
                </Link>
              </Box>
              <Spacer h={3} />
              <SimpleBar style={{ maxHeight: height - 85 }} autoHide={true}>
                <Box className="animate-in fade-in max-w-xl">
                  <Card
                    className={`${
                      !isHistoryEnabled && 'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                    }`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                      <CardTitle className="animate-in fade-in text-md font-medium w-full">
                        {t('Capture History', { ns: 'settings' })}
                      </CardTitle>
                      <Switch
                        checked={isHistoryEnabled}
                        className="ml-auto"
                        onCheckedChange={() => {
                          setIsHistoryEnabled(!isHistoryEnabled)
                        }}
                      />
                    </CardHeader>
                    <CardContent>
                      <Text className="text-sm text-muted-foreground">
                        {t('Enable history capture', { ns: 'settings' })}
                      </Text>
                    </CardContent>
                  </Card>
                </Box>
                {isHistoryEnabled && (
                  <>
                    <Box className="max-w-xl animate-in fade-in mt-4">
                      <Card
                        className={`${
                          !isHistoryAutoUpdateOnCaputureEnabled &&
                          'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Auto-Update on Capture', { ns: 'settings' })}
                          </CardTitle>
                          <Switch
                            checked={isHistoryAutoUpdateOnCaputureEnabled}
                            className="ml-auto"
                            onCheckedChange={() => {
                              setIsHistoryAutoUpdateOnCaputureEnabled(
                                !isHistoryAutoUpdateOnCaputureEnabled
                              )
                            }}
                          />
                        </CardHeader>
                        <CardContent>
                          <Text className="text-sm text-muted-foreground">
                            {t('Enable auto update on capture', { ns: 'settings' })}
                          </Text>
                        </CardContent>
                      </Card>
                    </Box>

                    <Box className="mt-4 max-w-xl animate-in fade-in">
                      <Card
                        className={`${
                          !isAutoFavoriteOnDoubleCopyEnabled &&
                          'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Auto-Star on Double Copy', { ns: 'settings' })}
                          </CardTitle>
                          <Switch
                            checked={isAutoFavoriteOnDoubleCopyEnabled}
                            className="ml-auto"
                            onCheckedChange={() => {
                              setIsAutoFavoriteOnDoubleCopyEnabled(
                                !isAutoFavoriteOnDoubleCopyEnabled
                              )
                            }}
                          />
                        </CardHeader>
                        <CardContent>
                          <Text className="text-sm text-muted-foreground">
                            {t(
                              'Add a star to the copied text when you copy it twice within 1 second. This allows you to quickly add copied text or links to your favorites and easily find it in the clipboard history.',
                              { ns: 'settings' }
                            )}
                          </Text>
                        </CardContent>
                      </Card>
                    </Box>

                    <Box className="mt-4 max-w-xl animate-in fade-in">
                      <Card
                        className={`${
                          !isAutoGenerateLinkCardsEnabled &&
                          'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Auto-Generate Link Card Preview', { ns: 'settings' })}
                          </CardTitle>
                          <Switch
                            checked={isAutoGenerateLinkCardsEnabled}
                            className="ml-auto"
                            onCheckedChange={() => {
                              setIsAutoGenerateLinkCardsEnabled(
                                !isAutoGenerateLinkCardsEnabled
                              )
                            }}
                          />
                        </CardHeader>
                        <CardContent>
                          <Text className="text-sm text-muted-foreground">
                            {t(
                              'Automatically create link card preview in the clipboard history. This allows to quickly view website details without opening or pasting the link.',
                              { ns: 'settings' }
                            )}
                          </Text>
                        </CardContent>
                      </Card>
                    </Box>

                    <Box className="mt-4 max-w-xl animate-in fade-in">
                      <Card
                        className={`${
                          !isAutoPreviewLinkCardsEnabled &&
                          'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Auto-Preview Link on Hover', { ns: 'settings' })}
                          </CardTitle>
                          <Switch
                            checked={isAutoPreviewLinkCardsEnabled}
                            className="ml-auto"
                            onCheckedChange={() => {
                              setIsAutoPreviewLinkCardsEnabled(
                                !isAutoPreviewLinkCardsEnabled
                              )
                            }}
                          />
                        </CardHeader>
                        <CardContent>
                          <Text className="text-sm text-muted-foreground">
                            {t(
                              'Create a preview card on link hover in the clipboard history. This allows you to preview the link before opening or pasting it.',
                              { ns: 'settings' }
                            )}
                          </Text>
                        </CardContent>
                      </Card>
                    </Box>

                    <Box className="max-w-xl animate-in fade-in mt-4">
                      <Card
                        className={`${
                          !isExclusionAppListEnabled &&
                          'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Excluded Apps List', { ns: 'settings' })}
                          </CardTitle>
                          <Switch
                            checked={isExclusionAppListEnabled}
                            className="ml-auto"
                            onCheckedChange={() => {
                              setIsExclusionAppListEnabled(!isExclusionAppListEnabled)
                            }}
                          />
                        </CardHeader>
                        <CardContent>
                          <Text className="text-sm text-muted-foreground mb-2">
                            {t(
                              'Applications listed below will not have their copy to clipboard action captured in clipboard history. Case insensitive.',
                              { ns: 'settings' }
                            )}
                          </Text>

                          <TextArea
                            className="text-sm"
                            isDisabled={!isExclusionAppListEnabled}
                            label={t(
                              'List each application name or window identifier on a new line.',
                              {
                                ns: 'settings',
                              }
                            )}
                            placeholder={undefined}
                            rows={5}
                            maxRows={15}
                            enableEmoji={false}
                            onBlur={() => {
                              setHistoryExclusionAppList(
                                trimAndRemoveExtraNewlines(exclusionAppListValue)
                              )
                            }}
                            onChange={e => {
                              setExclusionAppListValue(e.target.value)
                            }}
                            value={exclusionAppListValue}
                          />
                        </CardContent>
                      </Card>
                    </Box>

                    <Box className="max-w-xl animate-in fade-in mt-4">
                      <Card
                        className={`${
                          !isExclusionListEnabled &&
                          'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Stop Words List', { ns: 'settings' })}
                          </CardTitle>
                          <Switch
                            checked={isExclusionListEnabled}
                            className="ml-auto"
                            onCheckedChange={() => {
                              setIsExclusionListEnabled(!isExclusionListEnabled)
                            }}
                          />
                        </CardHeader>
                        <CardContent>
                          <Text className="text-sm text-muted-foreground mb-2">
                            {t(
                              'Words or sentences listed below will not be captured in clipboard history if found in the copied text. Case insensitive.',
                              { ns: 'settings' }
                            )}
                          </Text>

                          <TextArea
                            className="text-sm"
                            isDisabled={!isExclusionListEnabled}
                            label={t('List each word or sentence on a new line.', {
                              ns: 'settings',
                            })}
                            placeholder={undefined}
                            rows={5}
                            maxRows={15}
                            enableEmoji={false}
                            onBlur={() => {
                              setHistoryExclusionList(
                                trimAndRemoveExtraNewlines(exclusionListValue)
                              )
                            }}
                            onChange={e => {
                              setExclusionListValue(e.target.value)
                            }}
                            value={exclusionListValue}
                          />
                        </CardContent>
                      </Card>
                    </Box>

                    <Box className="max-w-xl animate-in fade-in mt-4">
                      <Card
                        className={`${
                          !isAutoMaskWordsListEnabled &&
                          'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Auto Masking Words List', { ns: 'settings' })}
                          </CardTitle>
                          <Switch
                            checked={isAutoMaskWordsListEnabled}
                            className="ml-auto"
                            onCheckedChange={() => {
                              setIsAutoMaskWordsListEnabled(!isAutoMaskWordsListEnabled)
                            }}
                          />
                        </CardHeader>
                        <CardContent>
                          <Text className="text-sm text-muted-foreground mb-2">
                            {t(
                              'Sensitive words or sentences listed below will automatically be masked if found in the copied text. Case insensitive.',
                              { ns: 'settings' }
                            )}
                          </Text>

                          <TextArea
                            className="text-sm"
                            label={t('List each word or sentence on a new line.', {
                              ns: 'settings',
                            })}
                            placeholder={undefined}
                            isDisabled={!isAutoMaskWordsListEnabled}
                            rows={5}
                            maxRows={15}
                            enableEmoji={false}
                            onFocus={() => {
                              setIsAutoMaskWordsTextAreaInFocus(true)
                            }}
                            onBlur={() => {
                              setAutoMaskWordsList(
                                trimAndRemoveExtraNewlines(autoMaskListValue)
                              )
                              setIsAutoMaskWordsTextAreaInFocus(false)
                            }}
                            onChange={e => {
                              setAutoMaskListValue(e.target.value)
                            }}
                            value={
                              isAutoMaskWordsTextAreaInFocus
                                ? autoMaskListValue
                                : maskValue(autoMaskListValue)
                            }
                          />
                        </CardContent>
                      </Card>
                    </Box>
                    <Box className="max-w-xl animate-in fade-in mt-4">
                      <Card
                        className={`${
                          !isHistoryDetectLanguageEnabled &&
                          'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                        }`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Programming Language Detection', { ns: 'settings' })}
                          </CardTitle>
                          <Switch
                            checked={isHistoryDetectLanguageEnabled}
                            className="ml-auto"
                            onCheckedChange={() => {
                              setIsHistoryDetectLanguageEnabled(
                                !isHistoryDetectLanguageEnabled
                              )
                            }}
                          />
                        </CardHeader>
                        <CardContent>
                          <Text className="text-sm text-muted-foreground">
                            {t('Enable programming language detection', {
                              ns: 'settings',
                            })}
                          </Text>
                        </CardContent>
                      </Card>
                    </Box>
                  </>
                )}

                {isHistoryEnabled && isHistoryDetectLanguageEnabled && (
                  <>
                    <Box className="max-w-xl mt-4 animate-in fade-in">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Minimum number of lines to trigger detection', {
                              ns: 'settings',
                            })}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <InputField
                            className="text-md !w-36"
                            error={
                              false ? t('Invalid number', { ns: 'common' }) : undefined
                            }
                            small
                            label={t('Number of lines', { ns: 'common' })}
                            value={historyDetectLanguageMinLines}
                            onChange={e => {
                              const value = e.target.value
                              if (value === '') {
                                setHistoryDetectLanguageMinLines(0)
                              } else {
                                const number = parseInt(value)
                                if (number) {
                                  setHistoryDetectLanguageMinLines(number)
                                }
                              }
                            }}
                          />
                        </CardContent>
                      </Card>
                    </Box>
                    <Box className="mt-4 max-w-2xl animate-in fade-in">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                          <CardTitle className="animate-in fade-in text-md font-medium w-full">
                            {t('Programming Language Selection', { ns: 'settings' })}
                            <Text className="mt-2 text-sm text-muted-foreground">
                              {t(
                                'To ensure the best detection accuracy, please select up to 7 languages. Limiting choices improves precision.',
                                { ns: 'settings' }
                              )}
                            </Text>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Box className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 py-2">
                            {languageList.map((language, index) => (
                              <button
                                key={index}
                                className="flex"
                                onClick={() => {
                                  if (
                                    historyDetectLanguagesEnabledList.length >= 7 &&
                                    !historyDetectLanguagesEnabledList.includes(language)
                                  ) {
                                    return
                                  }
                                  setHistoryDetectLanguagesEnabledList(
                                    historyDetectLanguagesEnabledList.includes(language)
                                      ? historyDetectLanguagesEnabledList.filter(
                                          lang => lang !== language
                                        )
                                      : historyDetectLanguagesEnabledList.concat([
                                          language,
                                        ])
                                  )

                                  const newPrioritizedLanguages =
                                    prioritizedLanguages.includes(language)
                                      ? prioritizedLanguages.filter(
                                          lang => lang !== language
                                        )
                                      : prioritizedLanguages.concat([language])

                                  setPrioritizedLanguages(
                                    newPrioritizedLanguages.filter(Boolean)
                                  )
                                  setHistoryDetectLanguagesPrioritizedList(
                                    newPrioritizedLanguages.filter(Boolean)
                                  )
                                }}
                              >
                                <CheckBoxFilter
                                  label={language}
                                  checked={historyDetectLanguagesEnabledList.includes(
                                    language
                                  )}
                                />
                              </button>
                            ))}
                          </Box>
                        </CardContent>
                      </Card>
                    </Box>

                    {prioritizedLanguages.length > 0 && (
                      <Box className="mt-4 max-w-2xl animate-in fade-in">
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                            <CardTitle className="animate-in fade-in text-md font-medium w-full">
                              {t('Prioritize Language Detection', { ns: 'settings' })}
                              <Text className="mt-2 text-sm text-muted-foreground">
                                {t(
                                  'Drag and drop to prioritize languages for detection. The higher a language is in the list, the higher its detection priority.',
                                  { ns: 'settings' }
                                )}
                              </Text>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <DndContext
                              collisionDetection={closestCenter}
                              onDragEnd={event => {
                                const { active, over } = event
                                if (over?.id && active.id !== over?.id) {
                                  setPrioritizedLanguages(items => {
                                    const oldIndex = items.indexOf(active.id.toString())
                                    const newIndex = items.indexOf(over.id.toString())
                                    const newArray = arrayMove(items, oldIndex, newIndex)
                                    if (!arraysEqual(items, newArray)) {
                                      setHistoryDetectLanguagesPrioritizedList(newArray)
                                    }
                                    return newArray
                                  })
                                }
                              }}
                            >
                              <SortableContext
                                items={prioritizedLanguages}
                                strategy={verticalListSortingStrategy}
                              >
                                {prioritizedLanguages.map(
                                  language =>
                                    language && (
                                      <SortableItem
                                        key={language}
                                        id={language}
                                        language={language}
                                      />
                                    )
                                )}
                              </SortableContext>
                            </DndContext>
                          </CardContent>
                        </Card>
                      </Box>
                    )}
                  </>
                )}

                <Box className="mt-4 max-w-xl animate-in fade-in">
                  <Card
                    className={`${
                      !isAutoClearSettingsEnabled &&
                      'opacity-80 bg-gray-100 dark:bg-gray-900/80'
                    }`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                      <CardTitle className="animate-in fade-in text-md font-medium w-full">
                        {t('Auto-Clear Settings', { ns: 'settings' })}
                      </CardTitle>
                      <Switch
                        checked={isAutoClearSettingsEnabled}
                        className="ml-auto"
                        onCheckedChange={() => {
                          setIsAutoClearSettingsEnabled(!isAutoClearSettingsEnabled)
                        }}
                      />
                    </CardHeader>
                    <CardContent>
                      <Text className="text-sm text-muted-foreground">
                        {t(
                          'Configure settings to automatically delete clipboard history items after a specified duration.',
                          { ns: 'settings' }
                        )}
                      </Text>
                      {isAutoClearSettingsEnabled && (
                        <Flex className="mt-6 row justify-start">
                          <Text className="text-sm text-muted-foreground">
                            {t('Auto-delete clipboard history after', { ns: 'settings' })}
                          </Text>

                          <Flex className="mx-2">
                            <Select
                              value={autoClearSettingsDurationType}
                              onValueChange={value => {
                                setAutoClearSettingsDurationType(value)
                                setAutoClearSettingsDuration(1)
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="days">
                                  <span className="font-medium">
                                    {t('Days', { ns: 'calendar' })}
                                  </span>
                                </SelectItem>
                                <SelectItem value="weeks">
                                  <span className="font-medium">
                                    {t('Weeks', { ns: 'calendar' })}
                                  </span>
                                </SelectItem>
                                <SelectItem value="months">
                                  <span className="font-medium">
                                    {t('Months', { ns: 'calendar' })}
                                  </span>
                                </SelectItem>
                                <SelectItem value="year">
                                  <span className="font-medium">
                                    {t('Years', { ns: 'calendar' })}
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </Flex>
                          <Flex>
                            <Select
                              value={autoClearSettingsDuration.toString()}
                              onValueChange={value => {
                                setAutoClearSettingsDuration(Number(value))
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {durationOptionsMapByType[
                                  autoClearSettingsDurationType as keyof typeof durationOptionsMapByType
                                ].map((duration: number) => (
                                  <SelectItem key={duration} value={duration.toString()}>
                                    <span className="font-medium whitespace-nowrap">
                                      {getAutoClearSettingDurationLabel(
                                        duration,
                                        autoClearSettingsDurationType
                                      )}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Flex>
                        </Flex>
                      )}
                    </CardContent>
                  </Card>
                </Box>

                <Spacer h={6} />

                <Link to={returnRoute} replace>
                  <Button
                    variant="ghost"
                    className="text-sm bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                    size="sm"
                  >
                    {t('Back', { ns: 'common' })}
                  </Button>
                </Link>
                <Spacer h={4} />
              </SimpleBar>
            </Box>
          )
        )
      }}
    </AutoSize>
  )
}
