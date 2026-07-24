import { redirectToMemberHome, type MemberRouteParams } from '../legacy-redirects'

export default async function MemberActivityPage(props: MemberRouteParams) {
  await redirectToMemberHome(props)
}
