import { redirectToMemberMe, type MemberRouteParams } from '../legacy-redirects'

export default async function MemberHistoryPage(props: MemberRouteParams) {
  await redirectToMemberMe(props)
}
