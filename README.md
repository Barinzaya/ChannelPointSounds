This web page listens for Twitch channel point rewards being redeemed, and plays a sound in response to specific rewards. It is intended to be added to OBS as a Browser Source, so that the connection is made automatically and the audio can be controlled by OBS.

# Installation

1. A Twitch authentication token must be generated and added into the `Config.js` file. Instructions for generating the token are in that file. The channel for which the token is generated is the one which is monitored for channel point rewards.
2. The sounds to play should also be configured in `Config.js`.
3. Open `ChannelPointSounds.html` in a browser, and confirm that it works. If it does not work, you can check the Javascript console for any errors that are logged.
4. Add `ChannelPointSounds.html` as a browser source in OBS. If you check "Control audio via OBS" on the Browser Source configuration page, then the audio volume can be controlled via OBS. In that case, you will want to set that audio source to "monitor and output" so that the sounds play through the speakers as well as the stream.

# Auth Token Security

The auth token that is generated for this tool only has permissions for reading channel point redemptions, but nonetheless it is not sent or stored aside from being given back to you to put in the configuration file. Thus, it is not made available to any third parties in the process of generating it.
