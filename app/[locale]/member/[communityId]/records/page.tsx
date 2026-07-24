import { redirectToMemberMe, type MemberRouteParams } from '../legacy-redirects'

export default async function MemberRecordsPage(props: MemberRouteParams) {
  await redirectToMemberMe(props)
}
