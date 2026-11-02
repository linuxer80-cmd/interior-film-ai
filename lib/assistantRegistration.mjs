export function assistantRegistrationMode(params) {
  if (params.get("assistantRegister") !== "1") return null;
  const mode = params.get("inputMode") || "direct";
  return ["direct", "text", "screenshot", "call"].includes(mode) ? mode : "direct";
}
