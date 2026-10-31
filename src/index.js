// REX-Chat proxy (Cloudflare Worker)
//
//   Roblox script  <->  this Worker  <->  wss://chatroom.openfun.app/ws
//
// A plain pass-through. The only thing it changes is the "join" packet: it adds the room
// password, so the script doesn't need to contain it. No secrets or variables needed.
// Don't commit this file to a public repo, because the password is in it.

const UPSTREAM_URL = "https://chatroom.openfun.app/ws";
const PASSWORD = "&3,/99£,2)0-!gwog?2£-9.)?ggwo)3?/&).9bwj!:.p):!?"; // change this if you rotate the room password
const ROOM_RE = /^REX-Chat-Room(?:[1-9]|1[0-5])$/; // only your 15 rooms get the password

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/ws") {
      return new Response("REX-Chat relay is running.", { status: 200 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket connection.", { status: 426 });
    }

    // Open the connection to OpenFun
    let upstream = null;
    try {
      const response = await fetch(UPSTREAM_URL, { headers: { Upgrade: "websocket" } });
      upstream = response.webSocket;
    } catch (e) {
      upstream = null;
    }

    if (!upstream) {
      return new Response("Chat server unavailable.", { status: 502 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    upstream.accept();

    // Script -> OpenFun (adds the password to join packets)
    server.addEventListener("message", (event) => {
      let out = event.data;

      if (typeof out === "string") {
        try {
          const data = JSON.parse(out);

          if (data && data.type === "join") {
            if (typeof data.room !== "string" || !ROOM_RE.test(data.room)) {
              server.send(JSON.stringify({
                type: "error",
                code: "invalid_room",
                message: "Unknown room.",
              }));
              return;
            }

            data.password = PASSWORD;
            out = JSON.stringify(data);
          }
        } catch (e) {
          // not JSON: pass through untouched
        }
      }

      try { upstream.send(out); } catch (e) {}
    });

    // OpenFun -> script
    upstream.addEventListener("message", (event) => {
      try { server.send(event.data); } catch (e) {}
    });

    const closeBoth = () => {
      try { server.close(1000, "closed"); } catch (e) {}
      try { upstream.close(1000, "closed"); } catch (e) {}
    };

    server.addEventListener("close", closeBoth);
    server.addEventListener("error", closeBoth);
    upstream.addEventListener("close", closeBoth);
    upstream.addEventListener("error", closeBoth);

    return new Response(null, { status: 101, webSocket: client });
  },
};
