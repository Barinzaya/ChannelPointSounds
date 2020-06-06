(async function() {
	// Basic configuration: see Config.js

	// Advanced configuration
	// You shouldn't need to change any of this
	const CLIENT_ID = '5jxy0hrwy2ef5d8e74lpjcn4ygoaaq';
	const LISTEN_TIMEOUT  = 10;

	const PING_INTERVAL = 270;
	const PING_TIMEOUT  = 10;
	const PING_VARIANCE = 0.1;

	const RETRY_MIN_DELAY = 1;
	const RETRY_MAX_DELAY = 60;
	const RETRY_GROWTH = 2;
	const RETRY_VARIANCE = 0.1;

	// Code
	const logElement = document.getElementById('log');
	const soundsElement = document.getElementById('sounds');

	let ws = null;

	let listenTimeout = null;
	let pingTimeout = null;
	let pongTimeout = null;

	let retry = true;
	let retryDelay = RETRY_MIN_DELAY;
	let retryTimeout = null;

	let user;
	try {
		user = await getUserInfo();
		if(user === null) {
			log('User not found!');
			return;
		}
	}
	catch(e) {
		log(`Failed to get user info: ${e.status} ${e.statusText}`);
		return;
	}

	const useQueue = ('queue' in ChannelPointSoundsConfig) ? !!ChannelPointSoundsConfig.queue : true;
	const queue = [];

	connect();

	const eventHandlers = {
		'MESSAGE': function(e) {
			let topic = e.data.topic;
			if(topic.endsWith(`.${user.id}`)) {
				topic = topic.substring(0, topic.length - user.id.length - 1);
			}

			const handler = topicHandlers[topic];
			if(handler) {
				handler(e);
			}
		},

		'PONG': function(e) {
			if(pongTimeout !== null) {
				clearTimeout(pongTimeout);
				pongTimeout = null;
			}
		},

		'RECONNECT': function(e) {
			ws.close();
		},

		'RESPONSE': function(e) {
			if(listenTimeout !== null) clearTimeout(listenTimeout);
			listenTimeout = null;

			if(e.error === '') {
				log('Listening for notifications...');
			} else {
				log(`Failed to listen for notifications: ${e.error}`);
				log('Check the script configuration and try again.');

				retry = false;
				ws.close();
			}
		},
	};

	const topicHandlers = {
		'channel-points-channel-v1': function(e) {
			const message = JSON.parse(e.data.message);
			const reward = message.data.redemption.reward;

			const sound = ChannelPointSoundsConfig.sounds[reward.title];
			if(sound) {
				createSound(sound.path, sound.volume / 100);
			} else {
				log(`No configured sound for reward "${reward.title}".`);
			}
		},
	};

	function connect() {
		if(ws) return;

		if(retryTimeout !== null) {
			clearTimeout(retryTimeout);
			retryTimeout = null;
		}

		log('Connecting...');

		ws = new WebSocket('wss://pubsub-edge.twitch.tv');
		ws.addEventListener('close',   (e) => onSocketClose());
		ws.addEventListener('error',   (e) => onSocketError(e.toString()));
		ws.addEventListener('message', (e) => onSocketMessage(e.data));
		ws.addEventListener('open',    (e) => onSocketOpen());
	}

	function createSound(path, volume) {
		const element = new Audio(path);
		element.volume = volume;
		soundsElement.appendChild(element);

		element.addEventListener('ended', function(e) {
			log(`Finished playing <${path}>: ${e.message}`);
			removeSound(element);
		});
		element.addEventListener('error', function(e) {
			log(`Failed to load <${path}>: ${e.message}`);
			removeSound(element);
		});

		queue.push(element);
		if(useQueue && queue.length > 1) {
			log(`Queued <${path}> to play.`);
			element.load();
		} else {
			log(`Playing <${path}>.`);
			element.play();
		}
	}

	function getUserInfo() {
		return new Promise(function(resolve, reject) {
			const xhr = new XMLHttpRequest();

			const url = 'https://api.twitch.tv/helix/users';
			xhr.open('GET', url);
			xhr.responseType = 'json';

			xhr.addEventListener('error', function() {
				reject({
					status: this.status,
					statusText: this.statusText,
				});
			});
			xhr.addEventListener('load', function() {
				if(this.status >= 200 && this.status < 300) {
					const data = this.response.data;
					if(data.length === 1) {
						resolve(data[0]);
					} else {
						resolve(null);
					}
				} else {
					reject({
						status: this.status,
						statusText: this.statusText,
					});
				}
			});

			xhr.setRequestHeader('Authorization', `Bearer ${ChannelPointSoundsConfig.authToken}`);
			xhr.setRequestHeader('Client-ID', CLIENT_ID);
			xhr.send();
		});
	};

	function log(message) {
		if(logElement) {
			let content = logElement.value;

			if(content.length > 0) {
				content += '\n';
			}
			content += message;

			logElement.value = content;
		} else {
			console.log(message);
		}
	}

	function onListenTimeout() {
		listenTimeout = null;
		ws.close();
	}

	function onPingTimeout() {
		send({
			type: 'PING',
		});

		pingTimeout = setTimeout(onPingTimeout, vary(PING_INTERVAL, PING_VARIANCE) * 1000);
		pongTimeout = setTimeout(onPongTimeout, PING_TIMEOUT * 1000);
	}

	function onPongTimeout() {
		pongTimeout = null;
		ws.close();
	}

	function onRetryTimeout() {
		retryDelay = Math.min(RETRY_GROWTH * retryDelay, RETRY_MAX_DELAY);
		retryTimeout = null;

		connect();
	}

	function onSocketClose() {
		ws = null;

		if(pingTimeout !== null) clearTimeout(pingTimeout);
		pingTimeout = null;

		if(pongTimeout !== null) clearTimeout(pongTimeout);
		pongTimeout = null;

		if(retry) {
			let delay = vary(retryDelay, RETRY_VARIANCE);
			log(`Connection closed. Reconnecting in ${delay.toFixed(1)} second(s)...`);
			retryTimeout = setTimeout(onRetryTimeout, delay * 1000);
		} else {
			log('Connection closed.');
		}
	}

	function onSocketError(error) {
		log(`ERROR: ${error}`);
	}

	function onSocketMessage(raw) {
		const data = JSON.parse(raw);
		log(`> ${raw}`);

		const handler = eventHandlers[data.type];
		if(handler) {
			handler(data);
		}
	}

	function onSocketOpen() {
		log('Connected.');

		send({
			type: 'LISTEN',
			data: {
				auth_token: ChannelPointSoundsConfig.authToken,
				topics: [
					`channel-points-channel-v1.${user.id}`,
				],
			},
		});

		listenTimeout = setTimeout(onListenTimeout, LISTEN_TIMEOUT * 1000);
		pingTimeout = setTimeout(onPingTimeout, vary(PING_INTERVAL, PING_VARIANCE) * 1000);
		retryDelay = RETRY_MIN_DELAY;
	}

	function removeSound(element) {
		soundsElement.removeChild(element);

		const i = queue.indexOf(element);
		if(i >= 0) {
			queue.splice(i, 1);
		}

		if(useQueue && i === 0 && queue.length > 0) {
			queue[0].play();
		}
	}

	function send(data) {
		const raw = JSON.stringify(data);

		log(`< ${raw}`);
		ws.send(raw);
	}

	function vary(value, variance) {
		variance *= (2*Math.random() - 1);
		return (1 + variance) * value;
	}
})();
