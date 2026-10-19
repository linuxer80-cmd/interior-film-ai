export async function verifySuperAdmin(client) {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id) throw new Error("로그인이 필요합니다.");
  const { data: result, error: statusError } = await client.rpc("get_super_admin_status");
  if (statusError) throw new Error("슈퍼관리자 권한을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
  const status = Array.isArray(result) ? result[0] : result;
  if (status?.is_super_admin !== true) throw new Error("슈퍼관리자 권한이 없는 계정입니다.");
}
export async function signInSuperAdmin(client, email, password) {
  const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) {
    if (error.message?.toLowerCase().includes("invalid login credentials"))
      throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
    throw new Error("로그인하지 못했습니다. 이메일 인증 여부와 입력 정보를 확인해주세요.");
  }
  try { await verifySuperAdmin(client); }
  catch (error) {
    await client.auth.signOut({ scope: "local" });
    throw error;
  }
}
