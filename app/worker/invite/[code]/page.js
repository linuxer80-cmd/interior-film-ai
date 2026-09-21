import WorkerInviteSignup from "./WorkerInviteSignup";

export default async function WorkerInvitePage({ params }) {
  const { code } = await params;

  return (
    <WorkerInviteSignup
      inviteCode={code || ""}
    />
  );
}
