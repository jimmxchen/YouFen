import { redirect } from 'next/navigation'

export interface MemberRouteParams {
  params: {
    locale: string
    communityId: string
  }
}

export function redirectToMemberHome({ params }: MemberRouteParams) {
  redirect(`/${params.locale}/member/${params.communityId}`)
}

export function redirectToMemberMe({ params }: MemberRouteParams) {
  redirect(`/${params.locale}/member/${params.communityId}/me`)
}
