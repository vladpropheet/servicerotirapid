// Dă unui cont existent o parolă temporară nouă, afișată O SINGURĂ DATĂ. La logare trebuie schimbată.
// Toate sesiunile contului se închid. Pentru parole uitate sau pentru predarea contului către patron.
//
//   npm run admin:reset-password -- --telefon "0766 777 130"
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { phoneToUsername, resetToTemporaryPassword } from "@/server/auth/users";
import { closeDb, getDb } from "@/server/db/client";
import { authUser } from "@/server/db/schema";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { telefon: { type: "string" } } });
  const username = values.telefon ? phoneToUsername(values.telefon) : null;
  if (!username) throw new Error('Folosire: --telefon "07xx xxx xxx"');

  const [user] = await getDb().select({ id: authUser.id }).from(authUser).where(eq(authUser.username, username));
  if (!user) throw new Error("Nu există niciun cont cu acest telefon.");

  const temporaryPassword = await resetToTemporaryPassword(user.id, null);
  console.log("\nParola a fost resetată. Contul a fost deconectat de pe toate dispozitivele.");
  console.log(`  Telefon (pentru logare): ${values.telefon}`);
  console.log(`  Parolă temporară:        ${temporaryPassword}`);
  console.log("\nNotează parola acum: nu se mai afișează și nu e salvată nicăieri în clar.");
  console.log("La prima logare pe /admin/login se cere o parolă nouă.\n");
}

main()
  .catch((error: unknown) => {
    console.error("Parola nu a fost resetată:", error instanceof Error && error.name !== "DrizzleQueryError" ? error.message : "eroare la baza de date.");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
