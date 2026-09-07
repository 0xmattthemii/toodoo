import { z } from "zod";

const uuid = z.uuid();

/**
 * Entities are created with an id the client picked, so a new task or project
 * can show up (and be navigated to) before the server has answered, and the
 * server's row then matches the one already on screen. The server only takes
 * a well-formed UUID; anything else is rejected before touching the database.
 */
export function isValidId(id: unknown): id is string {
  return uuid.safeParse(id).success;
}

/** A fresh id for something about to be created. */
export function newId() {
  return crypto.randomUUID();
}
