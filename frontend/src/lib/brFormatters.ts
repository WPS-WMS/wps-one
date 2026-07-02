export function formatarCep(value: string) {
  const numeros = value.replace(/\D/g, "").slice(0, 8);
  return numeros.replace(/(\d{5})(\d{3})/, "$1-$2");
}

export function formatarCnpj(value: string) {
  const numeros = value.replace(/\D/g, "").slice(0, 14);
  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 5) return numeros.replace(/(\d{2})(\d{1,3})/, "$1.$2");
  if (numeros.length <= 8) return numeros.replace(/(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
  if (numeros.length <= 12) return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, "$1.$2.$3/$4");
  return numeros.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function formatarCpf(value: string) {
  const numeros = value.replace(/\D/g, "").slice(0, 11);
  if (numeros.length <= 3) return numeros;
  if (numeros.length <= 6) return numeros.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  if (numeros.length <= 9) return numeros.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function formatarDocumento(personType: "PJ" | "PF", value: string) {
  return personType === "PF" ? formatarCpf(value) : formatarCnpj(value);
}

export function formatarTelefone(value: string) {
  const numeros = value.replace(/\D/g, "");
  if (numeros.length <= 10) {
    return numeros.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return numeros.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
}

export function displayDocumento(personType: "PJ" | "PF", raw: string) {
  return formatarDocumento(personType, raw.replace(/\D/g, ""));
}
