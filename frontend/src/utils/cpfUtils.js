/**
 * Valida CPF com verificação de dígitos
 * @param {string} cpf - CPF (com ou sem máscara)
 * @returns {boolean}
 */
export function validarCPF(cpf) {
  const nums = cpf.replace(/\D/g, "");
  if (nums.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(nums)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
  let resto = soma % 11;
  const dig1 = resto < 2 ? 0 : 11 - resto;
  if (parseInt(nums[9]) !== dig1) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
  resto = soma % 11;
  const dig2 = resto < 2 ? 0 : 11 - resto;
  if (parseInt(nums[10]) !== dig2) return false;

  return true;
}

/**
 * Aplica máscara de CPF: 000.000.000-00
 * @param {string} value - valor digitado
 * @returns {string} valor formatado
 */
export function mascaraCPF(value) {
  let val = value.replace(/\D/g, "").slice(0, 11);
  val = val.replace(/(\d{3})(\d)/, "$1.$2");
  val = val.replace(/(\d{3})(\d)/, "$1.$2");
  val = val.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return val;
}
