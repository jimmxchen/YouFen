import { redirectToMemberMe, type MemberRouteParams } from '../legacy-redirects'

export default function MemberRecordsPage(props: MemberRouteParams) {
  redirectToMemberMe(props)
}
