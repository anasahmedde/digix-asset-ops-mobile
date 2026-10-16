import api from "./api";
import { cached } from "./offline";
import { User } from "./types";

/** Who is signed in - the last answer kept, so the app still knows without signal. */
export async function getCurrentUser(): Promise<User> {
  return (await cached("me", async () => (await api.get<User>("/accounts/users/me/")).data)).data;
}
