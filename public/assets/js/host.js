var socket = io();
var gameState = 0;
var currentPage = "createGame";
var drawTimer;
var drawStartTime;
var timeToDraw;
var userAvatars = {};
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
        if(seconds < 10) {
            niceTime += "." + tenths; "<span class='small'>." + tenths + "</span>";
        }
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

socket.on('created', function(msg) {
    showPage("peopleJoining");
    $('#header').text('Room code: ' + msg);
    $("#roomCode").text(msg);
    $('#announcements').prepend($('<li class="collection-item">').text('Room created'));
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

socket.on("start_game", function(data) {
    showPage("busyDrawing");
    timeToDraw = data.timeLeft;
    drawStartTime = $.now();
    updateTimer();
    drawTimer = window.setInterval(updateTimer, 100);
});

socket.on("startGuessingRound", function(data) {
    console.log("started guessing round");
    showPage("guessingRound");
    $(".guess-image").attr("src", data.image);
    $(".people-with-descriptions-container").html("");
    peopleWithDescriptions = 0;
});

var peopleWithDescriptions = 0;
socket.on("clientAddedDescription", function(data) {
    console.log("adding ")
    $(".people-with-descriptions-container." + (peopleWithDescriptions % 2 == 0 ?"left" : "right"))
        .append("<img id=\"user-description-" + data.username + "\" />");
    $("#user-description-" + data.username).attr("src", userAvatars[data.username]);
    peopleWithDescriptions++;
});

socket.on("showDescriptions", function(descriptions) {
    showPage("showDescriptions");
    var counter = 1;
    $(".description-container").html("");
    for(i in descriptions) {
        if(descriptions.hasOwnProperty(i)) {
            var description = descriptions[i];
            $(".description-container." + (counter % 2 == 0 ?"right" : "left")).append("<p>" + description + "</p>");
            counter++;
        }
    }
});

socket.on("disconnect", function() {
    showPage("disconnect");
});

var guesses;
socket.on("showGuesses", function(data) {
    showPage("showGuesses");
    guesses = data;
    showGuess();
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
function updateTimer() {
    seconds = timeToDraw - ($.now() - drawStartTime)/1000;
    $("#timeLeft").html(getNiceTime(seconds));
    if(seconds < 0) {
        window.clearInterval(drawTimer);
        window.setTimeout(function() {$("#timeLeft").text("The round will begin shortly.");}, 1000);
    }
}

