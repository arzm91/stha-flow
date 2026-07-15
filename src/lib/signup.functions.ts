import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
  nome: z.string().min(1).max(200),
  empresa: z.string().max(200).optional().default(""),
  accessCode: z.string().min(1).max(200),
});

export const signUpWithAccessCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const expected = process.env.SIGNUP_ACCESS_CODE;
    if (!expected) {
      throw new Error("Cadastro indisponível no momento.");
    }
    if (data.accessCode.trim() !== expected) {
      throw new Error("Código de acesso inválido.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome, empresa: data.empresa ?? "" },
    });
    if (error) {
      throw new Error(error.message);
    }
    return { ok: true };
  });
