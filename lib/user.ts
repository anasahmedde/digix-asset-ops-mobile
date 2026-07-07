import api from "./api";
import { User } from "./types";

export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<User>("/accounts/users/me/");
  return data;
}
