import { setGlobalOptions } from "firebase-functions/v2";
import "./lib/db.js";

setGlobalOptions({ region: "us-central1", maxInstances: 10, invoker: "public" });

export {
  createRoom,
  joinRoom,
  setExpectedPlayerCount,
  startGame,
  addBots,
  restartGame,
} from "./handlers/game.js";

export { submitNightAction, markNightReady, startNight, submitCangaceiroConsult } from "./handlers/night.js";

export { submitVote, sendChatMessage, advanceDay } from "./handlers/day.js";

export {
  brasContinueChoice,
  coronelStartAccusation,
  coronelAccusationVote,
  cangaceiroTiroCerto,
  saciGorroSwap,
  markSaciGorroOffer,
} from "./handlers/dayActions.js";
