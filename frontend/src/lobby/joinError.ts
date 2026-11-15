/** The /check-login messages, shared by JOIN and PLAY INSTEAD. */

/** Shown when the request never got a response. */
export const CONTACT_ERROR =
  "There was an error contacting the server. Please wait and try again.";

/** Shown when the server answered but the connection could not be made. */
export const CONNECT_ERROR =
  "There was an error connecting to the server. Please try again.";

/** The message for a failed /check-login response. */
export function joinErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return "Sign in to play.";
    case 404:
      return "The lobby could not be found.";
    case 403:
      return "You're already in this lobby in another tab or window.";
    case 488:
      return "The lobby is currently in a game.";
    case 489:
      return "The lobby is currently full.";
    default:
      return CONNECT_ERROR;
  }
}
