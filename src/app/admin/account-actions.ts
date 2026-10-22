"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/auth";
import { newPasswordProblem } from "@/server/auth/password";
import { getSessionUser } from "@/server/auth/session";
import { markPasswordChanged } from "@/server/auth/users";

export type PasswordState = { error: string | null; done?: boolean };

/** Schimbarea parolei (obligatorie după o parolă temporară). Închide sesiunile de pe celelalte dispozitive. */
export async function changePasswordAction(_previous: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  const currentPassword = String(formData.get("parola_actuala") ?? "");
  const newPassword = String(formData.get("parola_noua") ?? "");
  const confirm = String(formData.get("parola_confirmare") ?? "");
  if (newPassword !== confirm) return { error: "Cele două parole noi nu sunt la fel." };
  if (newPassword === currentPassword) return { error: "Parola nouă trebuie să fie diferită de cea veche." };
  const problem = newPasswordProblem(newPassword, user.username);
  if (problem) return { error: problem };

  try {
    await getAuth().api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    if (isAPIError(error)) return { error: "Parola actuală nu e corectă." };
    console.error("Schimbarea parolei a eșuat:", error instanceof Error ? error.name : "unknown");
    return { error: "A apărut o problemă. Încearcă din nou." };
  }
  await markPasswordChanged(user.id);
  redirect(user.platformRole === "superadmin" ? "/superadmin" : "/admin");
}

export async function logoutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/admin/login");
}

/** „Deconectează-mă de pe toate dispozitivele” (CLAUDE.md §6). */
export async function logoutEverywhereAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  await getAuth().api.revokeSessions({ headers: await headers() });
  redirect("/admin/login");
}
