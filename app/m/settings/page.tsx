import { redirect } from "next/navigation"
import { MobileAccountSettingsScreen } from "@/components/mobile/account-settings-screen"
import { getSession } from "@/lib/auth-session"
import {
  getProfileDisplayName,
  getDefaultAIProviderConfig,
  getAIProviderConfigs,
} from "@/lib/db/queries"
import {
  getProvider,
  isProviderId,
  type ProviderId,
} from "@/lib/ai/providers"
import {
  getProviderCredentialStatusesForOwner,
  hasGatewayEnvironmentCredential,
} from "@/lib/ai/providers/server"

export const metadata = {
  title: "Settings — u did dat",
}

export default async function MobileSettingsPage() {
  const session = await getSession()
  if (!session) redirect("/auth/login")
  const user = session.user

  const [displayName, defaultProviderConfig, credentialStatuses, providerConfigs] = await Promise.all([
    getProfileDisplayName(user.id),
    getDefaultAIProviderConfig(user.id),
    getProviderCredentialStatusesForOwner(user.id),
    getAIProviderConfigs(user.id),
  ])

  const savedProviderId: ProviderId | null = isProviderId(defaultProviderConfig?.name)
    ? defaultProviderConfig.name
    : null

  const provider = getProvider(savedProviderId)
  const environmentCredentialAvailable = hasGatewayEnvironmentCredential()

  return (
    <MobileAccountSettingsScreen
      email={user.email ?? ""}
      displayName={displayName}
      currentProviderId={provider.id}
      savedProviderId={savedProviderId}
      credentialStatuses={credentialStatuses}
      environmentCredentialAvailable={environmentCredentialAvailable}
      providerConfigs={providerConfigs}
    />
  )
}
