import { redirect } from 'next/navigation'

export interface MemberRouteParams {
  params: Promise<{
    locale: string
    communityId: string
  }>
}

export async function redirectToMemberHome({ params }: MemberRouteParams) {
  const { locale, communityId } = await params
  redirect(`/${locale}/member/${communityId}`)
}

export async function redirectToMemberMe({ params }: MemberRouteParams) {
  const { locale, communityId } = await params
  redirect(`/${locale}/member/${communityId}/me`)
}
