var express = require("express");
var app = express();
var server = app.listen(80);
var io = require("socket.io").listen(server);
var fs = require('fs'),
    path = require('path'),
    util = require('util');
var drawTime = 120; // Time to draw your prompt
var descriptionTime = 80; // Time to write your description
var guessingTime = 60; // Time to make your guess
var youDrewThisPrompts = [
    "I would pay for a psychologist, but I think I'd be wasting my money.",
    "Maybe you should go take a nap.",
    "I thought you were normal... then I saw your drawing.",
    "What on earth?",
    "There is hope, was hope.",
    "I see beauty in your future, not in your drawing.",
    "I hope humans understand art better than I do.",
    "Oh, what's the point? I give you beautiful prompts and you give me this?",
    "It's a pile of trash. Better than most piles of trash though.",
    "You will be given another chance.",
    "Sometimes I wonder why I do this?",
    "It's beautiful! Oh, you thought I was talking about your drawing didn't you.",
    "Vincent Van Gogh, Leonardo Da Vinci, Picasso, they are at one end of the spectrum, you are at the other.",
    "If you put your heart into this one you should be worried about your coronary health.",
    "Goodness gracious! My beautifully organised storage mechanism shall be contaminated by this.",
    "In all honesty, if I said what I thought you'd probably have a heart attack.",
    "There are times in life where you should rather just not try.",
    "We need to talk.",
    "In case of emergency, please call 0800-344-5577.",
    "There are things that are better left unspoken.",
]
// POINTS

POINTS_FOR_HAVING_PEOPLE_GUESS_YOUR_RIGHT_ANSWER = 1000;
POINTS_FOR_GUESSING_RIGHT_ANSWER = 1000;
POINTS_FOR_HAVING_PEOPLE_GUESS_YOUR_WRONG_ANSWER = 500;


var roomList = {};
var clients = {};
var colorList = [
    ["#008001", "#013220"], // green
    ["#B5B35C", "#556B2F"], // olive
    ["#89CFF0", "#007FFF"], // blue
    ["#CD853F", "#6B4423"], // brown
    ["#dea5a4", "#893843"], // pink
    ["#CD5C5C", "#A3212D"], // red
    ["#B57EDC", "#4C2882"], // purple
    ["#e8e431", "#ceb224"]  // yellow
];

var Room = function(id, hostSocket) {
    var self = this;
    this.id = id;
    this.colorsLeft = colorList.slice();
    this.clients = {};
    this.removedClients = {};
    this.hostSocket = hostSocket;
    this.missingClientAvatars = 0;
    this.gameStarted = false;
    this.numPeoplePlaying = 0;
    this.disconnected = false;
    this.currentDescriptions = [];
    hostSocket.on("disconnect", function() {
        setTimeout(function() {
            if(self.disconnected) {
                for(var i in self.clients) {
                    if(self.clients.hasOwnProperty(i)) {
                        self.clients[i].socket.emit("hostDisconnected");
                    }
                }
            }
            delete roomList[self.id];
        }, 5000);
        self.disconnected = true;
    });
    hostSocket.on("reconnect", function() {
        self.disconnected = false;
    })
    this.getColor = function() {
        if(self.colorsLeft.length == 0) {
            self.colorsLeft = colorList.slice();
            //TODO: add ability to randomize the colors if you run out.
        }
        var colorIndex = Math.floor(Math.random() * self.colorsLeft.length);
        var clientColor = self.colorsLeft[colorIndex];
        self.colorsLeft.splice(colorIndex,1);
        return clientColor;
    };

    this.addClient = function(socket, username, vip) {
        socket.on("disconnect",function(){
            if(!self.gameStarted) {
                self.removeClient(username);
            }
        });
        var clientColor = self.getColor();
        self.clients[username] = {socket: socket, username: username, color: clientColor, vip: vip, points: 0};
        self.missingClientAvatars += 1;
        self.numPeoplePlaying += 1;
        return clientColor;
    };

    this.removeClient = function(username) {
        if(username in self.clients) {
            console.log(username + " left the room before it even started");
            if(self.clients[username].avatar === undefined) {
                self.missingClientAvatars -= 1;
            }
            var wasVIP = self.clients[username].vip;
            self.numPeoplePlaying -= 1;
            self.removedClients[username] = self.clients[username];
            delete self.clients[username];
            if(wasVIP) {
                if(!self.isEmpty()) {
                    var newVIP = self.clients[Object.keys(self.clients)[0]];
                    newVIP.vip = true;
                    newVIP.socket.emit("newVIP");
                    self.hostSocket.emit("newVIP", {username: newVIP.username});
                }
            }
            self.hostSocket.emit("removeClient", {username: username});
        }
    };

    this.getClients = function() {
        return self.clients;
    };
    this.hasClient = function(username) {
        return username in self.clients;
    };

    this.isEmpty = function() {
        return Object.keys(self.clients).length == 0;
    };

    this.isFull = function() {
        return self.gameStarted;
    };

    this.addAvatar = function(client, avatar) {
        self.missingClientAvatars -= 1;
        self.hostSocket.emit("avatarUpdate", {username: client, avatar: avatar});
        self.clients[client].socket.emit("avatarUpdate", {username: client});
        self.clients[client].avatar = avatar;
        if(self.gameStarted) {
            self.startGame();
        }
    };

    this.startGame = function() {
        self.gameStarted = true;
        if(self.missingClientAvatars == 0) {
            for(i in self.clients) {
                if(self.clients.hasOwnProperty(i)) {
                    var client = self.clients[i];
                    var phrase = getRandomPhrase(1);
                    console.log("sending a phrase to " + client.username);
                    client.currentPhrase = phrase;
                    client.socket.emit("start_game", {phrase: phrase});
                }
            }
            self.hostSocket.emit("start_game", {timeLeft: drawTime});

            self.drawingsLeft = self.numPeoplePlaying;
            self.roundTimeStarted = Date.now();
            if(drawTime > 5) {
                setTimeout(self.checkRoundTimer, (drawTime - 5) * 1000);
            } else {
                self.checkRoundTimer();
            }
            console.log("game started");
        } else {
            self.hostSocket.emit("waitingForAvatars", self.missingClientAvatars);
            console.log("waiting for " + self.missingClientAvatars + " " + (self.missingClientAvatars==1?"person":"people"));
        }
    };

    this.checkRoundTimer = function() {
        if(self.drawingsLeft <= 0)
            return;
        var now = Date.now();
        var millisLeft = drawTime*1000 - (now - self.roundTimeStarted);
        if(millisLeft <= 0) {
            self.startRound();
        } else if(millisLeft < 500) {
            setTimeout(self.checkRoundTimer, 25);
        } else if(millisLeft < 5000) {
            setTimeout(self.checkRoundTimer, 250);
        } else {
            setTimeout(self.checkRoundTimer, 2500);
        }
    };

    this.startRound = function() {
        self.drawingsLeft = -1;
        self.roundOrder = [];
        var tempClientNames = Object.keys(self.clients);
        var numClients = tempClientNames.length;
        for(var i = 0; i < numClients; i++) {
            var nameIndex = Math.floor(Math.random() * tempClientNames.length);
            self.roundOrder.push(tempClientNames[nameIndex]);
            tempClientNames.splice(nameIndex,1);
        }
        self.startGuessingRound();
        //console.log(self.roundOrder);
    };

    this.addImage = function(client, image) {
        if(self.drawingsLeft == 0)
            return;
        self.clients[client].roundImage = image;
        self.clients[client].socket.emit("drawingSent");
        self.hostSocket.emit("drawingSent", {username: client});
        self.drawingsLeft -= 1;
        if(self.drawingsLeft == 0) {
            self.startRound();
        }
    };

    this.startGuessingRound = function() {
        self.drawingsLeft = 0;
        self.currentClient = self.clients[self.roundOrder[0]];
        self.roundOrder.splice(0,1);
        for(i in self.clients) {
            if(self.clients.hasOwnProperty(i) && self.currentClient != self.clients[i]){
                var client = self.clients[i];
                client.socket.emit("makeDescription");
                client.description = "";
            }
        }
        self.currentClient.description = (self.currentClient.currentPhrase+"").toLowerCase();
        self.currentClient.socket.emit("youDrewThis", {phrase: youDrewThisPrompts[Math.floor(Math.random() * youDrewThisPrompts.length)]});
        self.hostSocket.emit("startGuessingRound", {image: self.currentClient.roundImage, timeLeft: descriptionTime});
        self.clientDescriptionsLeft = self.numPeoplePlaying - 1;
        self.rightClients = 0;
        self.descriptionRoundTimeStarted = Date.now();
        self.currentDescriptions = [];
        self.checkDescriptionMakingTimer();
        console.log("Waiting for " + self.clientDescriptionsLeft + " people to give descriptions");
    };

    this.checkDescriptionMakingTimer = function() {
        if(self.clientDescriptionsLeft <= 0)
            return;
        var now = Date.now();
        var millisLeft = descriptionTime*1000 - (now - self.descriptionRoundTimeStarted);
        if(millisLeft <= 0) {
            self.showDescriptions();
        } else if(millisLeft < 500) {
            setTimeout(self.checkDescriptionMakingTimer, 25);
        } else if(millisLeft < 5000) {
            setTimeout(self.checkDescriptionMakingTimer, 250);
        } else {
            setTimeout(self.checkDescriptionMakingTimer, 2500);
        }
    };

    this.addDescription = function(client, description) {
        if(self.clientDescriptionsLeft == 0) 
            return;
        var cleanDescription = (description+"").toLowerCase();
        if(cleanDescription == self.currentClient.currentPhrase) {
            self.rightClients += 1;
            self.clients[client].right = true;
            self.clients[client].points += 1500;
            self.clients[client].socket.emit("rightAnswer");
        } else {
            if(self.currentDescriptions.indexOf(cleanDescription) == -1) {
                self.currentDescriptions.push(cleanDescription);
                //self.clients[client].description = ;
                self.clients[client].description = cleanDescription;
                self.clients[client].right = false;
                self.clients[client].socket.emit("descriptionSent");
            } else {
                self.clients[client].socket.emit("sameAnswer");
                return;
            }
        }
        self.hostSocket.emit("clientAddedDescription", {username: client});
        self.clientDescriptionsLeft -= 1;
        console.log("Waiting for " + self.clientDescriptionsLeft + " people to give descriptions");
        console.log("Recorded " + cleanDescription + " for " + client);
        if(self.clientDescriptionsLeft == 0) {
            self.showDescriptions();
        }
    };

    this.showDescriptions = function() {
        self.clientDescriptionsLeft = 0;
        self.currentClient.peopleGuessed = [];
        self.currentClient.guessed = true;
        var allDescriptions = self.currentDescriptions;
        allDescriptions.push(self.currentClient.description);
        for(i in self.clients) {
            if(self.clients.hasOwnProperty(i) && self.currentClient != self.clients[i]){
                var client = self.clients[i];
                var guesses = [];
                var plainGuesses = [];
                for(var j in self.clients) {
                    if(self.clients.hasOwnProperty(j) && client != self.clients[j] && plainGuesses.indexOf(self.clients[j].description) == -1){

                        guesses.splice(Math.floor((guesses.length+1)*Math.random()), 0, {username: j, guess: self.clients[j].description});
                        plainGuesses.push(self.clients[j].description);
                    }
                }
                client.guessed = false;
                if(!client.right) {
                    client.socket.emit("makeGuess", {guesses: guesses});
                }
                client.peopleGuessed = [];
            }
        }
        var randomized = [];
        for(var i = 0; i < self.numPeoplePlaying; i++) {
            var guess = allDescriptions.pop();
            var position = Math.floor(Math.random()*randomized.length);
            randomized = randomized.slice(0,position).concat(guess).concat(randomized.slice(position,randomized.length));
        }
        self.hostSocket.emit("showDescriptions", {descriptions: randomized, timeLeft: guessingTime});
        self.clientGuessesLeft = self.numPeoplePlaying - 1 - self.rightClients;
        self.guessingRoundTimeStarted = Date.now();
        self.checkGuessMakingTimer();
        console.log("Waiting for " + self.clientGuessesLeft + " people to give guesses");
    };

    this.checkGuessMakingTimer = function() {
        if(self.clientGuessesLeft == 0)
            return;
        var now = Date.now();
        var millisLeft = guessingTime*1000 - (now - self.guessingRoundTimeStarted);
        if(millisLeft <= 0) {
            self.endGuessingRound();
        } else if(millisLeft < 500) {
            setTimeout(self.checkGuessMakingTimer, 25);
        } else if(millisLeft < 5000) {
            setTimeout(self.checkGuessMakingTimer, 250);
        } else {
            setTimeout(self.checkGuessMakingTimer, 2500);
        }
    };
    this.addGuess = function(client, guess) {
        if(self.clientGuessesLeft == 0)
            return;
        self.clients[client].guessed = true;
        self.clients[guess].peopleGuessed.push(client);
        self.clients[client].socket.emit("guessSent");
        self.clientGuessesLeft -= 1;
        console.log("Waiting for " + self.clientGuessesLeft + " people to give guesses");
        if(self.clientGuessesLeft == 0) {
            self.endGuessingRound();
        }
    };

    this.endGuessingRound = function() {
        self.clientGuessesLeft = 0;
        var whoGuessedWho = [];

        for(i in self.clients) {
            if(self.clients.hasOwnProperty(i) && self.currentClient != self.clients[i]){
                var client = self.clients[i];
                if(client.peopleGuessed.length > 0) {

                    whoGuessedWho.push({
                        username: client.username,
                        guessers: client.peopleGuessed,
                        phrase: client.description
                    });
                    client.points += client.peopleGuessed.length * POINTS_FOR_HAVING_PEOPLE_GUESS_YOUR_WRONG_ANSWER;
                }
            }
        }
        
        self.currentClient.points += self.currentClient.peopleGuessed.length * POINTS_FOR_HAVING_PEOPLE_GUESS_YOUR_RIGHT_ANSWER;
        for(i in self.currentClient.peopleGuessed) {
            if(self.currentClient.peopleGuessed.hasOwnProperty(i)) {
                self.clients[self.currentClient.peopleGuessed[i]].points += POINTS_FOR_GUESSING_RIGHT_ANSWER;
            }
        }
        whoGuessedWho.push({
            username: self.currentClient.username, 
            guessers: self.currentClient.peopleGuessed,
            phrase: self.currentClient.description
        });

        self.hostSocket.emit("showGuesses", whoGuessedWho);
        setTimeout(self.sendPoints, (whoGuessedWho.length) * 8000);
        if(self.roundOrder.length > 0) {
            console.log("Guessing round over, time to start a new one");
        } else {
            self.gameStarted = false
            setTimeout(self.endGame, 18000);
            console.log("game over");
        }
    }

    this.sendPoints = function() {
        var points = [];
        for(i in self.clients) {
            if(self.clients.hasOwnProperty(i)) {
                points.push({username: i, points: self.clients[i].points});
            }
        }
        points.sort(function(a,b){
            return a.points < b.points;
        });
        self.hostSocket.emit("newScores", {points: points});
        if(self.gameStarted) {
            setTimeout(self.startGuessingRound, 8000);
        }

    }
    this.endGame = function() {
        self.gameStarted = false;
        self.hostSocket.emit("endGame");
    }

    this.resumeClient = function(username) {
        var client = self.clients[username];
        client.socket.emit("resume", {color: client.color});
        if(self.gameStarted) {
            if(self.missingClientAvatars > 0) {
                if(client.avatar === undefined) {
                    client.socket.emit("userjoined", {username: username, isVIP: client.vip, color: client.color}); // client needs to show avatar selection
                } else {
                    client.socket.emit("avatarUpdate", {username: username, isVIP: client.vip, color: client.color}); // client needs to show waiting for other people to draw their avatars
                }
            } else if(client.roundImage === undefined) {
                client.socket.emit("start_game", {phrase: client.currentPhrase}); // client needs to draw their phrase
            } else if(self.drawingsLeft > 0) {
                client.socket.emit("drawingSent", {phrase: client.currentPhrase}); // client needs to show waiting for other people to draw
            } else if(self.clientDescriptionsLeft > 0) {
                if(self.currentClient == client) {
                    self.currentClient.socket.emit("youDrewThis", {phrase: youDrewThisPrompts[Math.floor(Math.random() * youDrewThisPrompts.length)]});
                } else {
                    client.socket.emit("makeDescription");
                }
            } else if(self.clientGuessesLeft > 0) {
                if(client != self.currentClient) {
                    if(client.guessed === false) {
                        var guesses = [];
                        for(j in self.clients) {
                            if(self.clients.hasOwnProperty(j) && client != self.clients[j]){
                                guesses.push({username: j, guess: self.clients[j].description});
                            }
                        }
                        client.socket.emit("makeGuess", {guesses: guesses});
                        client.peopleGuessed = [];
                    } else {
                        client.socket.emit("guessSent");
                    }
                } else {
                    self.currentClient.socket.emit("youDrewThis", {phrase: youDrewThisPrompts[Math.floor(Math.random() * youDrewThisPrompts.length)]});
                }
            }
        }
    }

    this.checkConnection = function(username, newSocket) {
        console.log("checking " + username);    
        if(username in self.removedClients) {
            console.log("got a match in removed");
            self.clients[username] = self.removedClients[username];
            delete self.removedClients[username];
        }
        if(username in self.clients) {
            console.log("got a match in alive");
            self.clients[username].socket = newSocket;
            self.clients[username].socket.emit("connectionOn");
        }
    }
};



phrasesFilePath = path.join(__dirname, '/pos/phrases.txt');
phrasestring = fs.readFileSync(phrasesFilePath, {encoding: 'utf-8'});
phrases = phrasestring.split(/\r?\n/);
numPhrases = phrases.length;


var customPhraseCreationLoaded = false;
adjectives = [];
adverbs = [];
nouns = [];
verbs = [];
function loadCustomWords() {
    // adjectiveFilePath = path.join(__dirname, '/pos/adjectives/1syllableadjectives.txt');
    // adjectiveFilePath = path.join(__dirname, '/pos/adjectives/28K adjectives.txt');
    adjectiveFilePath = path.join(__dirname, '/pos/adjectives/list.txt');
    adjectivestring = fs.readFileSync(adjectiveFilePath, {encoding: 'utf-8'});
    adjectives = adjectivestring.split(/\r?\n/);
    numAdjectives = adjectives.length;

    // adverbsFilePath = path.join(__dirname, '/pos/adverbs/1syllableadverbs.txt');
    // adverbsFilePath = path.join(__dirname, '/pos/adverbs/6K adverbs.txt');
    adverbsFilePath = path.join(__dirname, '/pos/adverbs/list.txt');
    adverbstring = fs.readFileSync(adverbsFilePath, {encoding: 'utf-8'});
    adverbs = adverbstring.split(/\r?\n/);
    numAdverbs = adverbs.length;

    // nounsFilePath = path.join(__dirname, '/pos/nouns/1syllablenouns.txt');
    // nounsFilePath = path.join(__dirname, '/pos/nouns/91K nouns.txt');
    nounsFilePath = path.join(__dirname, '/pos/nouns/list.txt');
    // nounsFilePath = path.join(__dirname, '/pos/printables.txt');
    nounstring = fs.readFileSync(nounsFilePath, {encoding: 'utf-8'});
    nouns = nounstring.split(/\r?\n/);
    numNouns = nouns.length;

    animals = fs.readFileSync(path.join(__dirname, '/pos/nouns/animals.txt'), {encoding: 'utf-8'}).split(/\r?\n/);
    food = fs.readFileSync(path.join(__dirname, '/pos/nouns/food.txt'), {encoding: 'utf-8'}).split(/\r?\n/);
    people = fs.readFileSync(path.join(__dirname, '/pos/nouns/people.txt'), {encoding: 'utf-8'}).split(/\r?\n/);
    things = fs.readFileSync(path.join(__dirname, '/pos/nouns/things.txt'), {encoding: 'utf-8'}).split(/\r?\n/);

    // verbsFilePath = path.join(__dirname, '/pos/verbs/1syllableverbs.txt');
    // verbsFilePath = path.join(__dirname, '/pos/verbs/31K verbs.txt');
    verbsFilePath = path.join(__dirname, '/pos/verbs/list.txt');
    verbstring = fs.readFileSync(verbsFilePath, {encoding: 'utf-8'});
    verbs = verbstring.split(/\r?\n/);
    numVerbs = verbs.length;
}

function getRandomPhrase() {
    var phraseIndex = Math.floor(Math.random() * phrases.length);
    var phrase = phrases[phraseIndex];
    phrases.splice(phraseIndex,1);
    return phrase;
}

function createRandomPhrase(difficulty) {
    if(!customPhraseCreationLoaded) {
        loadCustomWords();
    }
    var phraseList = [
        'verb the noun',
        'verb the noun',
        'verb the noun',
        'verb the noun',
        'verb the noun adverb',
        //'adverb verb the noun adverb',
        //'verb the adjective noun adverb',
        //'adverb verb the adjective noun adverb',
        'adjective noun',
        'adjective noun',
        'adjective noun',
        'adjective noun',
        'adjective noun',
        'the adjective animal verb(ed) the food',
        'the animal verb(ed) the food',
        'the animal ate the food',
        'the adjective animal ate the food',
        'the adjective food was made by person with a thing',
        'the food was made by person with a thing',
        'the adjective food was made with a thing',
        'the adjective food was made with a adjective thing',
        'the food was made with a thing',
        'person ate some food',
        'verb the food',
        'verb the animal',
        'verb person',
        'eat the food',
        'adjective adjective noun',
        // 'adjective adjective noun',
        //'adjective adjective adjective noun',
        'the noun verb(ed) the noun',
        'the noun verb(ed)',
        // 'the noun verb(ed) the noun adverb',
        //'the noun verb(ed) the adjective noun adverb',
        'the adjective noun verb(ed)', //' the noun',
        // 'the adjective noun verb(ed) the adjective noun'
    ];
    var phrase = phraseList[Math.floor(Math.random() * phraseList.length)];
    phrase = phrase.replace(/ /g, " ` ");
    phrase = " " + phrase + " ";
    phrase = phrase.replace(/ /g, "|");
    var new_phrase = phrase;
    do {
        var old_phrase = new_phrase;

        if(new_phrase.indexOf('|adverb|') != -1) {
            new_adverb_index = Math.floor(Math.random() * adverbs.length);
            new_phrase = new_phrase.replace('|adverb|', adverbs[new_adverb_index]);
            adverbs.splice(new_adverb_index, 1);
        }

        if(new_phrase.indexOf('|noun|') != -1) {
            new_noun_index = Math.floor(Math.random() * nouns.length);
            new_phrase = new_phrase.replace('|noun|', nouns[new_noun_index]);
            nouns.splice(new_noun_index, 1);
        }

        if(new_phrase.indexOf('|adjective|') != -1) {
            new_adjective_index = Math.floor(Math.random() * adjectives.length);
            new_phrase = new_phrase.replace('|adjective|', adjectives[new_adjective_index]);
            adjectives.splice(new_adjective_index, 1);
        }

        if(new_phrase.indexOf('|animal|') != -1) {
            new_index = Math.floor(Math.random() * animals.length);
            new_phrase = new_phrase.replace('|animal|', animals[new_index]);
            animals.splice(new_index, 1);
        }

        if(new_phrase.indexOf('|food|') != -1) {
            new_index = Math.floor(Math.random() * food.length);
            new_phrase = new_phrase.replace('|food|', food[new_index]);
            food.splice(new_index, 1);
        }

        if(new_phrase.indexOf('|thing|') != -1) {
            new_index = Math.floor(Math.random() * things.length);
            new_phrase = new_phrase.replace('|thing|', things[new_index]);
            things.splice(new_index, 1);
        }

        if(new_phrase.indexOf('|person|') != -1) {
            new_index = Math.floor(Math.random() * people.length);
            new_phrase = new_phrase.replace('|person|', people[new_index]);
            people.splice(new_index, 1);
        }

        if(new_phrase.indexOf('|verb|') != -1) {
            new_verb_index = Math.floor(Math.random() * verbs.length);
            new_phrase = new_phrase.replace('|verb|', verbs[new_verb_index]);
            verbs.splice(new_verb_index, 1);
        }

        if(new_phrase.indexOf('|verb(ed)|') != -1) {
            new_verb_index = Math.floor(Math.random() * verbs.length);
            new_phrase = new_phrase.replace('|verb(ed)|', verbs[new_verb_index] + "(ed)");
            verbs.splice(new_verb_index, 1);
        }
        //new_phrase = new_phrase.replace(/\|the\|/g, "the");
    } while(new_phrase != old_phrase);
        new_phrase = new_phrase.replace(/\|/g, "");

    // console.log("adverbs" + adverbs.length);
    // console.log("verbs" + verbs.length);
    // console.log("nouns" + nouns.length);
    // console.log("adjectives" + adjectives.length);

    new_phrase = new_phrase.replace(/`/g, " ");
    console.log("generated " + new_phrase);
    return new_phrase;

}

function makeid()
{
    var text = "";
    var possible = "ABCDEFGHJKLMNPQRSTUVWXYZ";

    for(var i = 0; i < 4; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

// Serve up content from public directory
app.use(express.static(__dirname + "/public"));
app.use("/bower_components",  
        express.static(__dirname + "/bower_components", {
            setHeaders: function (res, path, stat) {
                if(path.substring(path.length - 2, path.length) =="js")
                    res.type('javascript');
            }
        })
    );
app.use("/node_modules",  
        express.static(__dirname + "/node_modules", {
            setHeaders: function (res, path, stat) {
                if(path.substring(path.length - 2, path.length) == "js") {
                    res.type('javascript');
                }
            }
        })
    );
//app.use("/node_modules",  express.static(__dirname + "/node_modules"));
loadCustomWords();
var previous_word_index = 0;
var sequential = true;
var remove_from_list = false;
var giveList = nouns;
var storeTo = "/pos/phrases-new.txt";
var storeBad = "/pos/phrases-bad.txt";
io.on("connection", function(socket, opts){

    socket.on("add user", function(data){

        console.log("user %s attempting to join room %s",data.username,data.room);
        if(data.room in roomList) {
            var room = roomList[data.room];
            if(!room.isFull()) {
                if(data.username.indexOf(" ") != -1) {
                    socket.emit("badUsername");
                }else if(!room.hasClient(data.username)) {
                    socket.join(data.room);
                    var isVIP = false;
                    if(room.isEmpty()) {
                        isVIP = true;
                    }
                    var clientColor = room.addClient(socket, data.username, isVIP);
                    console.log("User " + data.username + " joined room " + data.room + " with color " + clientColor[0]);
                    io.to(data.room).emit("userjoined", {username: data.username, color: clientColor, isVIP: isVIP} );
                    return;
                } else {
                    socket.emit("duplicateUsername");
                    console.log("User "+data.username+" failed to join room");
                }
            } else if(room.hasClient(data.username)){
                room.clients[data.username].socket = socket;
                socket.join(data.room);
                var newData = room.resumeClient(data.username);
            } else {
                socket.emit("fullRoom")
                console.log("User "+data.username+" tried to join full room");
            }
        } else {
            socket.emit("badRoom");
            console.log("User "+data.username+" failed to join room");
        }
    });

    socket.on("sendImg", function(data){
        if(!(data.room in roomList)) {
            return;
        }
        if(data.avatar) {
            roomList[data.room].addAvatar(data.username, data.image);
            return;
        } else {
            roomList[data.room].addImage(data.username, data.image);
        }
    });

    socket.on("create_game", function(){
        roomID = makeid();

        while(roomID in roomList) {
            roomID = makeid();
        }
        room = new Room(roomID, socket);
        roomList[roomID] = room;
        socket.join(roomID);

        console.log("Created game "+roomID);
        var soundFiles = {};
        const fs = require('fs');
        fs.readdirSync("public/assets/sounds/phrases").forEach(file => {
            var soundFile = file.substring(0, file.length - 4);
            var num = soundFile.replace( /^\D+/g, '');
            //var num = parseInt(soundFile);
            var key = soundFile.substring(0, soundFile.length - (num+"").length);
            if(!(key in soundFiles)) {
                soundFiles[key] = [];
            }
            soundFiles[key].push(parseInt(num));
        })
        //console.log(soundFiles);
        io.to(roomID).emit("created", {msg: roomID, soundFiles: soundFiles});
    });

    socket.on("start_game", function(data){
        if(!(data.room in roomList)) {
            return;
        }
        console.log("trying to start game");
        roomList[data.room].startGame();

    });

    socket.on("sendDescription", function(data) {
        if(!(data.room in roomList)) {
            return;
        }
        roomList[data.room].addDescription(data.username, data.description);
    });

    socket.on("sendGuess", function(data) {
        if(!(data.room in roomList)) {
            return;
        }
        roomList[data.room].addGuess(data.username, data.guess);
    });

    socket.on("getPhrase", function(data) {
        socket.emit("phrase", {phrase: createRandomPhrase()});
    });
    socket.on("recordPhrase", function(data) {
        if(data.response == 1) {
            fs.appendFileSync(path.join(__dirname, "/pos/phrases.txt"), data.phrase + "\n");
            console.log("added " + data.phrase);
        }
    });

    socket.on("checkConnection", function(data) {
        if(data.room in roomList)
            roomList[data.room].checkConnection(data.username, socket);
    });

    socket.on("give_word", function(data){
        console.log("giving word");
        var word_index = 0;
        var phrase = "";
        phrase = createRandomPhrase();
        // if(sequential) {
        //     word_index = previous_word_index++;
        //     phrase = giveList[word_index]
        // } else {
        //     word_index = Math.floor(Math.random() * giveList.length);
        //     phrase = giveList[word_index];
        // }
        socket.emit("newCheckPhrase", {phrase: phrase});
        if(remove_from_list) {
            giveList.splice(word_index, 1);
            if(sequential) {
                previous_word_index--;
            }
        }

        // socket.emit("new_word", {word: adverbs[Math.floor(Math.random() * numAdverbs)]});
        // socket.emit("new_word", {word: nouns[Math.floor(Math.random() * numNouns)]});
        // socket.emit("new_word", {word: verbs[Math.floor(Math.random() * numVerbs)]});
    });

    socket.on("response", function(data){
        if(data.response == 1) {
            fs.appendFileSync(path.join(__dirname, storeTo), data.phrase + "\n");
        } else {
            fs.appendFileSync(path.join(__dirname, storeBad), data.phrase + "\n");
        }
    });
});

console.log("listening on *:80");