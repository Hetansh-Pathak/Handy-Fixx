import { fieldErrors } from "@handyfix/shared";
import { useCallback, useState } from "react";
import type { z } from "zod";

/** Minimal zod-backed form state: values, per-field errors, and a validate() that returns parsed data. */
export function useZodForm<S extends z.ZodTypeAny>(schema: S, initial: z.input<S>) {
  type In = z.input<S>;
  const [values, setValues] = useState<In>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = useCallback(<K extends keyof In & string>(key: K) => (value: In[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const validate = useCallback((): z.output<S> | null => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    setErrors(fieldErrors(result.error));
    return null;
  }, [schema, values]);

  return { values, setValues, set, errors, setErrors, validate };
}
