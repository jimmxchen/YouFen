import { redirectToMemberHome, type MemberRouteParams } from '../legacy-redirects'

export default function MemberActivityPage(props: MemberRouteParams) {
  redirectToMemberHome(props)
}
