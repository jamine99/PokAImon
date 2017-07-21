var request = require('request');
var util = require('./util');
// gamestate simulation
var CynthiAgent = require('./cynthiagent.js').CynthiAgent;
var Perspective = require('./interfacelayer.js').InterfaceLayer;
//helper functions
global.Tools = require('./zarel/tools.js').includeMods();
var ExtraTools = require('./database/tools.js');

//logging 
var fs = require('fs'); 

// required connect to server
var sockjs = require('sockjs-client-ws');

var Bot = {

	initializeBot: function(userID, password, battleFormat) {	
		this.ROOMS = {};
		this.NOOFROOMS = 0;
		//set testing mode on/off		
		this.onTestingMode = true;
		this.battleFormat = '';
		this.ID = '';
		this.password = '';
		this.createShowdownServer();
		//receiving and sending message
		this.client.on('data', function (msg) {
			Bot.processMessage(msg);
		});
	},

	setID: function(userID, password, battleFormat) {	
		this.battleFormat = battleFormat;
		if (userID != null) {
			this.ID = userID;
			this.password = password;
		}
		else {
			this.ID = 'deepai';
			this.password = 'deepai';
		}
		if (!this.client)
			this.createShowdownServer();
		else {
			this.login();
		}			
	},

	//reserved for testing the performance of the bot
	startTesting: function() {
		this.setID('deepai','deepai','gen7randombattle');	
	},

	createShowdownServer: function() {
		var client = sockjs.create("http://sim.smogon.com:8000/showdown");
		this.client = client;
	},

	login: function() {
		var client = {};
		var loginname = '';
		var loginpass = '';

		if (this.client) {
			this.client.write('|/logout');
		}

		client = this.client;
		
		loginname = this.ID;
		loginpass = this.password;
		
		//send POST request to login server
		request.post({
			url : 'http://play.pokemonshowdown.com/action.php',
			form : {
				act: 'login',
				name: loginname,
				pass: loginpass,
				challstr : this.CHALLSTR
			}},

			//upon receiving a message from server after POST req is sent, this function will run
			function (err, response, body) {
				var data = util.safeJSON(body);
				var _request = "|/trn " + loginname + ",0," + data.assertion; 
				client.write(_request); //send assertion to server to confirm login
				client.write("|/avatar 260"); //set sprite to Cynthia
			}
		); 
	},

	sendingChallenge: function(userID, battleFormat, customTeamText) {
		//reading custom team
		var teamArray = '';
		var customTeam = '';
		if (customTeamText != null) {
			var teamArray = ExtraTools.importTeam(customTeamText); 
   			var customTeam = ExtraTools.packTeam(teamArray);
   		}
   		//start game
   		if (battleFormat == "gen7customgame") {
   			this.client.write("|/utm "+ customTeam);
			this.client.write("|/challenge " + userID + ", gen7customgame");
   		}
   		else if (battleFormat == "gen7randombattle") {
			this.client.write("|/challenge " + userID + ", gen7randombattle");
   		}
	},

	//Let the bot challenge random player
	startRandomBattle: function() {
		if (this.battleFormat = 'gen7randombattle') {
			this.client.write('|/utm null');
			this.client.write('|/search gen7randombattle');	
		}
		else if (this.battleFormat = 'gen7unratedrandombattle') {
			this.client.write('|/utm null');
			this.client.write('|/search gen7unratedrandombattle');	
		}
	},

	addRoom: function(roomtitle, botvsuser) {
		this.ROOMS[roomtitle] = new Room(roomtitle, botvsuser, this.ID);
		this.NOOFROOMS += 1;
	},

	removeRoom: function(rmnumber) {
		var room = this.ROOMS[rmnumber];
		if(room) {
			delete this.ROOMS[rmnumber];
			return true;
			Bot.NOOFROOMS -= 1;
		}	
		return false;
	},

	processMessage: function(message) {
		var parts;
		var roomtitle; // At the start of every messages directed to a battle, has the format "battle-battletype-roomnumber"
		var request

		var msg = message.replace(/^\s+/,"");

		if(msg.charAt(0) === '|' || msg.charAt(0) === '>') {
				parts = msg.substr(1).split('|');
			}
		else {
			parts =[];
		}

		console.log("Start of server message\n "+msg+"\n\n");

		//for testing mode
		//this is put here because bot starts sending randombattle challenge before it actually logs in
		if (msg.includes("updateuser") && msg.includes(this.ID) && this.ID != '') {
			if (this.onTestingMode) {
				this.startRandomBattle(); //trigger ontestingmode
			}
		}

		if (parts[0] != null) {
			//basically to obtain CHALLSTR, which is required for logging in
			if (parts[0]=="challstr") {
				var key_id = parts[1];
				var Challenge = parts[2];
				var CHALLSTR = key_id + "|" + Challenge;
				if (!this.CHALLSTR) {
					this.CHALLSTR = CHALLSTR;
				}
				//for testing
				if (this.onTestingMode) {
					this.startTesting();
				}
			}	

			if (msg.includes("updatechallenges")) { //acepting challenges from others
				var challenge = JSON.parse(parts[1]);
				if (challenge.challengesFrom != null) {
					var challengeobj = Object.keys(challenge.challengesFrom);
					var challenger = challengeobj[0];
					var format = challenge.challengesFrom[challenger];
					if (format == "gen7randombattle") {
						this.client.write("|/utm null");
						this.client.write("|/accept "+ challenger);
					}
					else if (format == "gen7customgame") {
						//Have to feed it some custom team here
						this.client.write("|/accept "+ challenger);
					}
					else if (format!= null) {
						console.log("Sorry, but the bot can't accept game of this format: "+ format);
					}
				}
			}

			if (parts[0].includes("battle")) {
				roomtitle = parts[0].replace(/\n|\r/g,'');
				if (!Bot.ROOMS[roomtitle]) {
					var botvsuser = '';
					if (msg.includes('init')) {
						var botvsuser = parts[4];
					}
					Bot.addRoom(roomtitle, botvsuser);

					//for testing -- to speed up testing
					if (this.onTestingMode) {
						if (this.NOOFROOMS < 4) {
							this.startRandomBattle();
						}
					}
				}

				else {
					if (msg.includes('|win|')) {						
						var logStream = fs.createWriteStream('winloss.txt', {'flags': 'a'});
						// use {'flags': 'a'} to append and {'flags': 'w'} to erase and write a new file
						logStream.write('\n'+ this.ROOMS[roomtitle].botvsuser);
						if (msg.includes(this.ID)) {
							logStream.write('You win!\n');
						}
						else {
							logStream.write('You lose!\n');		
						}
						logStream.end('')

						this.client.write('|/leave ' + roomtitle);
						this.removeRoom(roomtitle);
						
						//on testingmode
						if (this.onTestingMode) {
							this.client.write('|/utm null');
							this.client.write('|/search gen7randombattle');
						}

					}
					else if (msg.includes('|l|') || msg.includes('|leave|')) {
						this.client.write(roomtitle+'|/timer on')
					}
					else {
						var bot = this.ROOMS[roomtitle].bot;
						var agent = this.ROOMS[roomtitle].cynthiagent;
						bot.process(msg); //basically to process message sent from server to extract game
						if (parts[1] === 'request') {
							request = JSON.parse(parts[2]);
							if (request.teamPreview) {
								this.client.write(roomtitle + "|/team 123456|3"); //dummy

							}
							else if (request.forceSwitch) {
								console.log("Have to switch now!");
								var move =  bot.agent.decide(bot.battle, bot.cTurnOptions, bot.battle.sides[bot.mySID], true);
								this.client.write(roomtitle+"|/"+move);
							}
							else if (request.active ) {
								console.log("Have to make a move now!")
							}
						}
						if (parts[1] === 'error' && msg.includes("You need a switch response")) {
							var move =  bot.agent.decide(bot.battle, bot.cTurnOptions, bot.battle.sides[bot.mySID], true);
							this.client.write(roomtitle+"|/"+move);	
						}
						if (msg.indexOf('|turn|') > 0 ) {
							var move = bot.agent.decide(bot.battle, bot.cTurnOptions, bot.battle.sides[bot.mySID], false);
							this.client.write(roomtitle+"|/"+move);	
						}
					}
				}
			}
		}
	}
};

module.exports = Bot;

var Room = function(roomtitle, botvsuser, userID) {
	var roomParts = roomtitle.split('-');
	this.botvsuser = botvsuser;
	this.room = roomtitle;
	this.roomNumber = roomParts[2];
	this.battleType = roomParts[1];
	this.cynthiagent = new CynthiAgent();
	this.bot = new Perspective('Local room', userID, null, this.cynthiagent);
};