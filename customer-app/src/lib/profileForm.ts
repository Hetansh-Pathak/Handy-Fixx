export type Fields = { name: string; phone: string; pincode: string; city: string; address: string };
export type FieldKey = keyof Fields;
export type Errors = Partial<Record<FieldKey, string>>;

export const EMPTY_FIELDS: Fields = { name: "", phone: "", pincode: "", city: "", address: "" };

/** Order in which invalid fields get focus. */
export const VALIDATED_ORDER: FieldKey[] = ["name", "phone", "pincode"];

/** 10 digits, optionally with a +91 or 0 in front (so 10–12 digits in total). */
export const isValidPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").length;
  return digits >= 10 && digits <= 12;
};

export const validateProfile = (f: Fields): Errors => {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = "Enter your full name.";
  if (f.phone.trim() && !isValidPhone(f.phone)) e.phone = "Enter a 10-digit mobile number.";
  if (f.pincode && f.pincode.length !== 6) e.pincode = "A pincode has 6 digits.";
  return e;
};
