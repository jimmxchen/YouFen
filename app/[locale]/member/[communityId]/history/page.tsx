import { redirectToMemberMe, type MemberRouteParams } from '../legacy-redirects'

export default function MemberHistoryPage(props: MemberRouteParams) {
  redirectToMemberMe(props)
}
