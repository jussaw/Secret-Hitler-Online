/** The /check-login messages, shared by JOIN and PLAY INSTEAD. */

/** Shown when the request never got a response. */
export const CONTACT_ERROR =
  "There was an error contacting the server. Please wait and try again.";

/** The message for a failed /check-login response; `name` is the name that was tried. */
export function joinErrorMessage(status: number, name: string): string {
  switch (status) {
    case 404:
      return "The lobby could not be found.";
    case 403:
      return "There is already a user with the name '" + name + "' in the lobby.";
    case 488:
      return "The lobby is currently in a game.";
    case 489:
      return "The lobby is currently full.";
    default:
      return "There was an error connecting to the server. Please try again.";
  }
}
