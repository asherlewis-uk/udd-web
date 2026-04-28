"use client"

import { ChevronLeft, Bell, Activity, Hand, MessageSquare, Vibrate } from "lucide-react"
import { useState } from "react"

interface SettingsScreenProps {
  onBack: () => void
}

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [settings, setSettings] = useState({
    notifications: true,
    liveActivities: false,
    swipeRightToChat: true,
    showPrompts: true,
    hapticFeedback: true,
  })

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pb-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:scale-95 transition-transform"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto px-4 pb-safe">
        {/* Notification Settings */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Notification Settings
          </h2>
          <div className="rounded-2xl bg-secondary">
            <SettingsRow
              icon={<Bell className="h-5 w-5" />}
              label="Notifications"
              checked={settings.notifications}
              onToggle={() => toggleSetting("notifications")}
            />
            <div className="mx-4 h-px bg-border" />
            <SettingsRow
              icon={<Activity className="h-5 w-5" />}
              label="Live Activities"
              checked={settings.liveActivities}
              onToggle={() => toggleSetting("liveActivities")}
            />
          </div>
        </div>

        {/* Preview Screen */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Preview Screen
          </h2>
          <div className="rounded-2xl bg-secondary">
            <SettingsRow
              icon={<Hand className="h-5 w-5" />}
              label="Swipe Right to Chat"
              checked={settings.swipeRightToChat}
              onToggle={() => toggleSetting("swipeRightToChat")}
            />
          </div>
        </div>

        {/* Chat Screen */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Chat Screen
          </h2>
          <div className="rounded-2xl bg-secondary">
            <SettingsRow
              icon={<MessageSquare className="h-5 w-5" />}
              label="Show Prompts"
              checked={settings.showPrompts}
              onToggle={() => toggleSetting("showPrompts")}
            />
          </div>
        </div>

        {/* Haptics */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Haptics
          </h2>
          <div className="rounded-2xl bg-secondary">
            <SettingsRow
              icon={<Vibrate className="h-5 w-5" />}
              label="Haptic Feedback"
              checked={settings.hapticFeedback}
              onToggle={() => toggleSetting("hapticFeedback")}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsRow({
  icon,
  label,
  checked,
  onToggle,
}: {
  icon: React.ReactNode
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between p-4"
    >
      <div className="flex items-center gap-3">
        <span className="text-foreground">{icon}</span>
        <span className="text-base text-foreground">{label}</span>
      </div>
      <div
        className={`relative h-7 w-12 rounded-full transition-colors ${
          checked ? "bg-foreground" : "bg-muted"
        }`}
      >
        <div
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  )
}
