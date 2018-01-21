var socket = io();
var gameState = 0;
var currentPage = "createGame";
var drawTimer;
var guessingRoundTimer;
var descriptionRoundTimer;
var drawStartTime;
var timeToDraw;
var timeToDescribe;
var timeToGuess;
var userAvatars = {};
var soundFiles = {};
var marimbas = new Howl({
  src: ['assets/sounds/marimbas.wav'],
  autoPlay: false,
  preload: true,
  loop: true,
  volume: 0.3
});

var SoundPlayer = function() {
    var self = this;
    this.queue = [];
    this.playing = false;
    this.playSounds = function(howls) {
        for(var i in howls) {
            if(howls.hasOwnProperty(i)) {
                self.playSound(howls[i].sound, howls[i].delay);
            }
        }
    }
    this.playSound = function(howl, delay) {
        if(delay === undefined) {
            delay = 1000;
        }
        self.queue.push([howl, delay]);
        if(self.queue.length == 1 && self.playing == false) {
            self.soundEnded();
        }
        self.playing = true;
    }

    self.soundEnded = function() {
        self.playing = false;
        if(self.queue.length > 0) {
            var item = self.queue.shift();
            var howl = item[0];
            var delay = item[1];
            var howlID = howl.play();
            howl.once("end", function(){
                window.setTimeout(self.soundEnded, delay);
            }, howlID);
            self.playing = true;
        }
    }
};
var player = new SoundPlayer();

function getRandomSoundFile(name) {
    if(name in soundFiles) {
        var index = Math.floor(soundFiles[name].length*Math.random());
        return name + soundFiles[name][index];
    }
}


//var id1 = marimbas.play();
/*window.setTimeout(function() {
    marimbas.rate(1.05, id1);
}, 2500);*/

function showPage(page){
    $(".page").fadeOut(200, "swing", function(data) {
        if(this.id == currentPage) {
            $("#" + page).fadeIn(200, "swing");
            currentPage = page;
        }
    });
}

function getNiceTime(seconds) {
    if(seconds <= 0) {
        return "0s";
    }
    var minutes = Math.floor(seconds / 60);
    var tenths = Math.floor((seconds - Math.floor(seconds))*10);
    seconds = Math.floor(seconds % 60);

    var niceTime = "";
    if(minutes <= 0) {
        niceTime += seconds;
        // if(seconds < 10) {
        //     niceTime += "." + tenths; "<span class='small'>." + tenths + "</span>";
        // }
        niceTime += "s"
    } else {
        minutes += "";
        seconds += "";
        if(minutes.length == 1) {
            minutes = "0" + minutes;
        }
        if(seconds.length == 1) {
            seconds = "0" + seconds;
        }
        niceTime += minutes + ":" + seconds;// + "<span class='small'>." + tenths + "</span>";
    }
    return niceTime;
}
var gameController = function() {
    var self = this;
    this.currentState = "no-room";

}
$("#" + currentPage).show();

$("#create_game").on('click', function() {
    socket.emit('create_game');
});
var startGameSound,
    sentPhrasesSound,
    examplePhrase,
    drawingRoundHurryUpSound1,
    drawingRoundHurryUpSound2,
    descriptionRoundStartSound1,
    descriptionRoundStartSound2,
    descriptionRoundHurryUpSound1,
    descriptionRoundHurryUpSound2,
    guessingRoundStartSound,
    guessingRoundHurryUpSound1,
    guessingRoundHurryUpSound2,
    showGuessesSound,
    goodSounds = [],
    goodDrawingSounds = [],
    badSounds = [];

function getPhraseSound(name, volume) {
    var randomName = getRandomSoundFile(name);
    console.log("given" + name + " got " + randomName);
    return new Howl({
        src: ['assets/sounds/phrases/' + randomName + ".wav"],
        volume: volume || 1
    });
}
socket.on('created', function(data) {
    showPage("peopleJoining");
    $('#header').text('Room code: ' + data.msg);
    $("#roomCode").text(data.msg);
    $('#announcements').prepend($('<li class="collection-item">').text('Room created'));
    soundFiles = data.soundFiles;
    marimbas.play();
    var marimbasPlaying = true;
    $(document).on("keyup", function(event) {
        if(event.originalEvent.key == "p") {
            if(marimbasPlaying) {
                marimbas.pause();
            } else {
                marimbas.play();
            }
            marimbasPlaying = ! marimbasPlaying;
        }
    });
    //getRandomSoundFile("SentPhrases");
    startGameSound = getPhraseSound("intro");
    sentPhrasesSound = getPhraseSound("SentPhrases");
    examplePhrase = getPhraseSound("ExamplePhrase", 1.5);
    drawingRoundHurryUpSound1 = getPhraseSound("HurryUp");
    drawingRoundHurryUpSound2 = getPhraseSound("DrawingRoundHurryUp");
    for(var i = 0; i < 5; i++) {
        goodSounds.push(getPhraseSound("ItsGood"));
        goodDrawingSounds.push(getPhraseSound("ItsGoodDrawing"));
        badSounds.push(getPhraseSound("ItsBad"));
    }
    window.setTimeout(playRandomSounds, 2000);
});

socket.on('userjoined', function(data) {
    console.log(data);
    $('#announcements').prepend($('<li class="collection-item">').text(data.username +' joined the game'));
    $.get("templates/user_sidebar.hbs", function(template_text){
        var template = Handlebars.compile(template_text);
        var html = template({username: data.username, vip: (data.isVIP?"VIP":"")});
        $('#side_scoreboard').append(html);
        console.log(html);
    });
});

socket.on("newVIP", function(data) {
    $("#" + data.username + " .is-vip").text("VIP")
})
socket.on("removeClient", function(data) {
    $('#announcements').prepend($('<li class="collection-item">').text(data.username + " left before the game started"));
    $("#" + data.username).remove();
})

socket.on('usrImg', function(data) {
    console.log(data);
    $('#announcements').prepend($('<li class="collection-item">').text('User '+data.username+' drew a pic:'));
    $('#current_drawing').attr('src', data.image);
});

socket.on('avatarUpdate', function(data) {
    $("#" + data.username + " img").attr('src', data.avatar);
    userAvatars[data.username] = data.avatar;
});

var peopleWithDrawings = 0;

function playRandomSounds() {
    console.log("playing a random sound");
    // if( !startGameSound.playing() &&
    //     !sentPhrasesSound.playing() &&
    //     !examplePhrase.playing() &&
    //     !drawingRoundHurryUpSound1.playing() &&
    //     !drawingRoundHurryUpSound2.playing() &&
    //     !(descriptionRoundStartSound1 && descriptionRoundStartSound1.playing()) &&
    //     !(descriptionRoundStartSound2 && descriptionRoundStartSound2.playing()) &&
    //     !(descriptionRoundHurryUpSound1 && descriptionRoundHurryUpSound1.playing()) &&
    //     !(descriptionRoundHurryUpSound2 && descriptionRoundHurryUpSound2.playing()) &&
    //     !(guessingRoundStartSound && guessingRoundStartSound.playing()) &&
    //     !(guessingRoundHurryUpSound1 && guessingRoundHurryUpSound1.playing()) &&
    //     !(guessingRoundHurryUpSound2 && guessingRoundHurryUpSound2.playing()) &&
    //     !(showGuessesSound && showGuessesSound.playing())
    //    ) {
        player.playSound(getPhraseSound("Random", Math.random()*0.3+0.1), 200);
    // }
    var timeTillNextRandomSound = Math.floor(Math.random()*6000) + 6000;
    console.log("next sound in " + timeTillNextRandomSound);
    window.setTimeout(playRandomSounds, timeTillNextRandomSound);
}
socket.on("start_game", function(data) {
    showPage("busyDrawing");
    timeToDraw = data.timeLeft;
    drawStartTime = $.now();
    updateDrawingTimer();
    drawTimer = window.setInterval(updateDrawingTimer, 100);

    $(".people-with-drawings-container").html("");
    peopleWithDrawings = 0;
    player.playSounds([{sound: startGameSound, delay: 0}, {sound: sentPhrasesSound, delay: 0}, {sound: examplePhrase, delay: 1000}]);
    // var sgID = startGameSound.play();
    // startGameSound.on("end", function() {
    //     window.setTimeout(function() {
    //         var spID = sentPhrasesSound.;
    //         sentPhrasesSound.on("end", function() {
    //             examplePhrase.play();
    //         }, spID);
    //     }, 1000);
    // }, sgID)
});

socket.on("drawingSent", function(data) {
    $(".people-with-drawings-container." + (peopleWithDrawings % 2 == 0 ?"left" : "right"))
        .append("<img id=\"user-drawing-" + data.username + "\" />");
    $("#user-drawing-" + data.username).attr("src", userAvatars[data.username]);
    peopleWithDrawings++;
    if(Math.random() < 0.5) {
        if(goodDrawingSounds.length > 0) {
            player.playSound(goodDrawingSounds[0]);//.play();
            goodDrawingSounds.splice(0,1);
        }
    } else {
        if(badSounds.length > 0) {
            player.playSound(badSounds[0]);//.play();
            badSounds.splice(0,1);
        }
    }
})

socket.on("startGuessingRound", function(data) {
    drawingRoundDone = true;
    descriptionsDone = false;
    console.log("started guessing round");
    descriptionRoundStartSound1 = getPhraseSound("StartGuessing");
    descriptionRoundStartSound2 = getPhraseSound("GuessingInstruction");
    descriptionRoundHurryUpSound1 = getPhraseSound("HurryUp");
    descriptionRoundHurryUpSound2 = getPhraseSound("GuessingRoundHurryUp");
    guessingRoundStartSound = getPhraseSound("GuessTheAnswer");
    guessingRoundHurryUpSound1 = getPhraseSound("HurryUp");
    guessingRoundHurryUpSound2 = getPhraseSound("GuessTheAnswerHurryUp");
    showGuessesSound = getPhraseSound("ShowGuesses");
    timeToDescribe = data.timeLeft;
    describeStartTime = $.now();
    updateDescriptionTimer();
    descriptionRoundTimer = window.setInterval(updateDescriptionTimer, 100);
    playedHurryUp1 = false;
    playedHurryUp2 = false;
    playedDescriptionRoundHurryUp1 = false;
    playedDescriptionRoundHurryUp2 = false;
    playedGuessingRoundHurryUp1 = false;
    playedGuessingRoundHurryUp2 = false;
    showPage("guessingRound");
    $(".guess-image").attr("src", data.image);
    $(".people-with-descriptions-container").html("");
    peopleWithDescriptions = 0;
    player.playSounds([
        {
            sound: descriptionRoundStartSound1, 
            delay: 1000
        }, {
            sound: descriptionRoundStartSound2,
            delay: 500
        }
    ]);
});

var peopleWithDescriptions = 0;
socket.on("clientAddedDescription", function(data) {
    console.log("adding ")
    $(".people-with-descriptions-container." + (peopleWithDescriptions % 2 == 0 ?"left" : "right"))
        .append("<img id=\"user-description-" + data.username + "\" />");
    $("#user-description-" + data.username).attr("src", userAvatars[data.username]);
    peopleWithDescriptions++;
    //if(Math.random() < 0.5) {
        if(Math.random() < 0.5) {
            if(goodSounds.length > 0) {
                player.playSound(goodSounds[0], 200);//.play();
                goodSounds.splice(0,1);
            }
        } else {
            if(badSounds.length > 0) {
                player.playSound(badSounds[0], 200);//.play();
                badSounds.splice(0,1);
            }
        }
    //}
});

socket.on("showDescriptions", function(data) {
    descriptionsDone = true;
    guessingDone = false;
    showPage("showDescriptions");
    var counter = 1;
    $(".description-container").html("");
    var descriptions = data.descriptions;
    for(i in descriptions) {
        if(descriptions.hasOwnProperty(i)) {
            var description = descriptions[i];
            $(".description-container." + (counter % 2 == 0 ?"right" : "left")).append("<p>" + description + "</p>");
            counter++;
        }
    }
    timeToGuess = data.timeLeft;
    guessStartTime = $.now();
    updateGuessesTimer();
    guessingRoundTimer = window.setInterval(updateGuessesTimer, 100);
    playedHurryUp1 = false;
    playedHurryUp2 = false;
    window.setTimeout(function() {
        player.playSound(guessingRoundStartSound);//.play();
    }, 2000);
});

socket.on("disconnect", function() {
    showPage("disconnect");
});

var guesses;
socket.on("showGuesses", function(data) {
    showPage("showGuesses");
    guesses = data;
    showGuess();
    player.playSound(showGuessesSound);//.play();
    drawingRoundDone = false;
    guessingDone = true;
});

socket.on("newScores", function(data) {
    showPage("scoreDisplay");
    console.log(data);
    var scores = "";
    for(i in data.points) {
        if(data.points.hasOwnProperty(i)) {
            var client = data.points[i];
            scores += "<tr><td>" + client.username + "</td><td>" + client.points + "</td></tr>";
        }
    }
    $("#scoreDisplay .scores").html(scores);
});
var showGuessNum = 0;
function showGuess(){
    var new_show_guess = showGuessNum;
    console.log("calling showGuess: " + showGuessNum);
    if(guesses.length > 0) {
        var currentGuessing = guesses[0];
        guesses.splice(0,1);
        var guessers = "";
        var counter = 0;
        var timePerGuess = Math.min(1000/currentGuessing.guessers.length, 200);
        for(i in currentGuessing.guessers) {
            if(currentGuessing.guessers.hasOwnProperty(i)) {
                guessers += "<li><h3>" + currentGuessing.guessers[i] + "</h3></li>";
            }
        }
        $("#showGuesses .phrase").text(currentGuessing.phrase);
        $("#showGuesses .guessers").html(guessers).css("visibility","hidden");          
        $("#showGuesses .guessedFor").text("");

        window.setTimeout(function() {
            console.log("showing guessers: " + new_show_guess);
            $("#showGuesses .guessers").css("visibility","visible");;            
        }, 2000);
        window.setTimeout(function() {
            console.log("showing guessedFor: " + new_show_guess);
            var guessedFor = currentGuessing.username;
            console.log("username " + currentGuessing.username);
            console.log("Guesses left " + guesses.length);
            if(guesses.length == 0) {
                guessedFor += "<span class='right-answer'>The correct answer</small>";
            }
            $("#showGuesses .guessedFor").html(guessedFor);
        }, 4000);

        window.setTimeout(showGuess, 8000);
    }
    showGuessNum++;
}
var playedHurryUp1 = false,
    playedHurryUp2 = false,
    playedDescriptionRoundHurryUp1,
    playedDescriptionRoundHurryUp2,
    playedGuessingRoundHurryUp1,
    playedGuessingRoundHurryUp2;
var playedCountDown = 40,
    drawingRoundDone = false,
    descriptionsDone = false,
    guessingDone = false;
function updateDrawingTimer() {
    seconds = timeToDraw - ($.now() - drawStartTime)/1000;
    $(".time-left").html(getNiceTime(seconds));
    if(seconds < 0 || drawingRoundDone) {
        window.clearInterval(drawTimer);
        window.setTimeout(function() {$(".time-left").text("The round will begin shortly.");}, 1000);
        return;
    }
    if(seconds - 1 <= playedCountDown && playedCountDown % 5 == 0 && playedCountDown > 0) {
        countDown =  new Howl({
            src: ['assets/sounds/countdowns/'+playedCountDown+'.wav'],
            volume: 0.6
        });
        player.playSound(countDown, 0)//.play();
        playedCountDown -= 5;
    }
    if(seconds < 30 && !playedHurryUp1) {
        playedHurryUp1 = true;
        console.log("playing drawing round hurry up 1");
        player.playSound(drawingRoundHurryUpSound1, 300);//.play();
    }
    if(seconds < 15 && !playedHurryUp2) {
        playedHurryUp2 = true;
        console.log("playing drawing round hurry up 2");
        player.playSound(drawingRoundHurryUpSound2, 300);//.play();
    }
}

function updateDescriptionTimer() {
    seconds = timeToDescribe - ($.now() - describeStartTime)/1000;
    $(".time-left").html(getNiceTime(seconds));
    if(seconds < 0 || descriptionsDone) {
        window.clearInterval(descriptionRoundTimer);
        window.setTimeout(function() {$(".time-left").text("The round will begin shortly.");}, 1000);
        return;
    }
    if(seconds < 20 && !playedDescriptionRoundHurryUp1) {
        playedDescriptionRoundHurryUp1 = true;
        console.log("playing description round hurry up 1");
        player.playSound(descriptionRoundHurryUpSound1, 300);//.play();
    }
    if(seconds < 10 && !playedDescriptionRoundHurryUp2) {
        playedDescriptionRoundHurryUp2 = true;
        console.log("playing description round hurry up 2");
        player.playSound(descriptionRoundHurryUpSound2, 300);//.play();
    }

}

function updateGuessesTimer() {
    seconds = timeToGuess - ($.now() - guessStartTime)/1000;
    $(".time-left").html(getNiceTime(seconds));
    if(seconds < 0 || guessingDone) {
        window.clearInterval(guessingRoundTimer);
        window.setTimeout(function() {$(".time-left").text("The round will begin shortly.");}, 1000);
        return;
    }
    if(seconds < 15 && !playedGuessingRoundHurryUp1) {
        playedGuessingRoundHurryUp1 = true;
        console.log("playing guessing round hurry up 1");
        player.playSound(guessingRoundHurryUpSound1, 300);//.play();
    }
    if(seconds < 7 && !playedGuessingRoundHurryUp2) {
        playedGuessingRoundHurryUp2 = true;
        console.log("playing guessing round hurry up 2");
        player.playSound(guessingRoundHurryUpSound2, 300);//.play();
    }

}

