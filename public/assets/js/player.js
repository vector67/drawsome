var socket = io({autoConnect: true});

var simpleBoard = new DrawingBoard.Board("drawingArea", {
    controls: false,
    webStorage: false,
    size: 15
});

/*var avatarBoard = new DrawingBoard.Board("avatarDraw", {
    controls: false,
    webStorage: false,
    size: 5
});*/

var username = "";
var roomID = "";
var drawingAvatar = true;
var inputDisabled = false;
$("form").submit(function(){
    username = $("#username").val();
    $("#header").text(username);
    $("nav").fadeIn(200);
    roomID = $("#room").val().toUpperCase();
    //avatar_img = avatarBoard.getImg();
    socket.emit("add user", {username: username, room: roomID});// avatar: avatar_img});
    $("#m").val("");
    return false;
});
function setColors(lightColor, darkColor) {
    $("#lightColorButton").css("background-color", lightColor);
    simpleBoard.setColor(lightColor);
    $("nav").css("background-color", lightColor);
    $("#darkColorButton").css("background-color", darkColor);
}
function swapToLightColor() {
    $("#lightColorButton").addClass("selected");
    $("#darkColorButton").removeClass("selected");
    var newColor = $("#lightColorButton").css("background-color");
    simpleBoard.setColor(newColor);
    $("nav").css("background-color", newColor)
}
$("#lightColorButton").on("click", swapToLightColor);

function swapToDarkColor() {
    $("#lightColorButton").removeClass("selected");
    $("#darkColorButton").addClass("selected");
    var newColor = $("#darkColorButton").css("background-color");
    simpleBoard.setColor(newColor);
    $("nav").css("background-color", newColor)
}
$("#darkColorButton").on("click", swapToDarkColor);

function showDrawing() {
    $("#drawingArea").show();
    $(".draw-button-container").show();
}

function hideDrawing() {
    $("#drawingArea").hide();
    $(".draw-button-container").hide();
}

function hideEverything(){
    $(".vip-buttons").hide();
    $(".waiting-area").hide();
    $("#messages").hide();
    $("#initialForm").hide();
    endDrawing();
    $("#makeDescription").hide();
    $("#sendDescription").removeClass("disabled");
    $("#guesses").hide();
}
var oldWidth = 0;
var oldHeight = 0;
socket.on("userjoined", function(data) {

    if(data.username == $("#username").val())
    {
        $("#initialForm").hide();
        $("#messages").append($("<li>").text("Joined Room!"));
        setColors(data.color[0], data.color[1]);
        if(data.isVIP == true) {
            $(".vip-buttons").show();
        } else {
            $(".waiting-area").show();
        }
        $("#instructions").show().text("Draw an avatar for yourself.");
        showDrawing();
        var drawingArea = $("#drawingArea");
        var width = parseInt(drawingArea.css("width"));
        oldWidth = width;
        console.log(parseInt(width));
        var height = parseInt(drawingArea.css("height"));
        oldHeight = height;
        console.log(parseInt(height));
        if(width < height) {
            drawingArea.css("height", width + "px");
        } else {
            drawingArea.css("width", height + "px");
        }
        simpleBoard.resize();
        simpleBoard.reset({
            size: 5,
            color: data.color[0]
        });
    }
});

socket.on("newVIP", function() {
    $(".vip-buttons").show();
    $(".waiting-area").hide();
})
socket.on("badRoom", function(usr) {
    $("#messages").append($("<li>").text("Bad Room ID!"));
});

socket.on("duplicateUsername", function(usr) {
    $("#messages").append($("<li>").text("Duplicate Username!"));
});

socket.on("fullRoom", function(usr) {
    $("#messages").append($("<li>").text("Full room!"));
});

socket.on("badUsername", function(usr) {
    $("#messages").append($("<li>").text("Bad Username! Usernames can't have spaces in them."));
});

socket.on("start_game", function(data) {
    console.log("Game started");  
    $(".vip-buttons").hide();
    $(".waiting-area").hide();
    $("#instructions").text(data.phrase);
    $("#messages").hide();
    console.log(data.phrase);
    showDrawing();
    var drawingArea = $("#drawingArea");
    if(oldHeight == 0) {
        oldHeight = $(".drawing-board-canvas").outerHeight();
    }
    if(oldWidth == 0) {
        oldWidth = $(".drawing-board-canvas").outerWidth();
    }
    console.log("Old height was " + oldHeight);
    console.log("possible new height was " + parseInt($(window).innerHeight()) + "-" + $(".drawing-board-canvas").offset().top);
    oldHeight = Math.min(parseInt($(window).innerHeight()) - $(".drawing-board-canvas").offset().top - $(".draw-button-container").outerHeight(), oldHeight);
    console.log("New height is " + oldHeight);
    drawingArea.css("height", oldHeight + "px");
    drawingArea.css("width", oldWidth + "px");
    simpleBoard.resize();
    simpleBoard.reset({
        size: 5,
        color: $("#lightColorButton").css("background-color")
    });
});

socket.on("avatarUpdate", function(data) {
    //console.log(data);
    if(data.username == username) {
        
        endDrawing();
        $("#instructions").text("Nice work.");
    }
});

socket.on("resume", function(data) {
    hideEverything();
    setColors(data.color[0], data.color[1]);
});

function endDrawing() {
    hideDrawing();
    simpleBoard.resetBackground();
    swapToLightColor();
    $("#sendDrawing").removeClass("disabled");
}
socket.on("drawingSent", function(data) {
    endDrawing();
    $("#instructions").text("We got your drawing, please wait for everyone else to finish up.");
});

socket.on("youDrewThis", function(data) {
    endDrawing();
    $("#guesses").hide();
    $("#instructions").html("You drew this.<br>" + data.phrase);
});

socket.on("makeDescription", function() {
    endDrawing();
    $("#guesses").hide();
    $("#instructions").text("Type in what you think the drawing is:");
    $("#makeDescription").show();
    $("#makeDescription input").val("");
});

socket.on("descriptionSent", function() {
    $("#instructions").text("Thanks for your description.");
    $("#makeDescription").hide();
    $("#sendDescription").removeClass("disabled");
});
socket.on("sameAnswer", function() {
    $("#instructions").text("Your description was too similar to someone elses, please write a different description.");
    $("#sendDescription").removeClass("disabled");
});

socket.on("rightAnswer", function() {
    $("#instructions").text("Thanks for your correct description good job, you don't get to guess.");
    $("#makeDescription").hide();
    $("#sendDescription").removeClass("disabled");
});
var sentGuess = false;
function sendGuess(guess) {
    if(!inputDisabled && !sentGuess) {
        socket.emit("sendGuess", {room: roomID, username: username, guess: guess});
        sentGuess = true;
    }
}
socket.on("makeGuess", function(data) {
    $("#makeDescription").hide();
    $("#sendDescription").removeClass("disabled");
    $("#instructions").text("Which description do you think fits the picture best?");
    var guesses = $("#guesses");
    guesses.html("");
    var new_guesses = "";
    sentGuess = false;
    for(i in data.guesses) {
        if(data.guesses.hasOwnProperty(i)) {
            new_guesses += "<a class=\"collection-item\" href=\"#\" onClick=\"sendGuess('" + data.guesses[i].username + "');\">"+data.guesses[i].guess + ""; 
        }
    }
    guesses.html(new_guesses);
    $("#guesses").show();
});

socket.on("guessSent", function() {
    $("#instructions").text("Thanks for your guess.");
    $("#guesses").hide();
});

socket.on("disconnect", function(data) {
    //hideEverything();
    //socket.open();
    inputDisabled = true;
    window.setTimeout(function() {
        inputDisabled = false;
        $("#overlay").fadeIn(200);
        $("#disconnect")
            .html("<h4>Reconnecting..."+data+"</h4>")
            .fadeIn(200);
        window.setTimeout(function(){
            $("#disconnect")
                .html("<h3>Server probably died in a steaming heap.</h3>")
        }, 5000);
    }, 2000);
});
socket.on("hostDisconnected", function() {
    $("#overlay").fadeIn(200);
    $("#disconnect")
        .html("<h4>Host disconnected</h4>")
        .fadeIn(200);
});
socket.on('reconnect_attempt', function(attemptNumber){
    $("#disconnect")
        .html("<h4>Reconnecting attempting... try " + attemptNumber + "</h4>");
});

socket.on('reconnecting', function(attemptNumber){
    $("#disconnect")
        .html("<h4>Reconnecting... try " + attemptNumber + "</h4>");
});

socket.on("reconnect", function() {
    //hideEverything();
    socket.emit("checkConnection", {username: username, room: roomID});
    console.log("the thingy");
    $("#disconnect")
        .html("<h4>Reconnecting... still</h4>");
});

socket.on("connectionOn", function() {
    $("#overlay").fadeOut(200);
    $("#disconnect").fadeOut(200);
});

$("#sendDescription").on("click", function() {
    if(!inputDisabled) {
        $("#sendDescription").addClass("disabled");
        socket.emit("sendDescription", {room: roomID, username: username, description: $("#description").val()});
    }
});

$("#sendDrawing").on("click", function(){
    if(!inputDisabled) {
        var img = simpleBoard.getImg();
        socket.emit("sendImg", {username: username, room: roomID, image: img, avatar: drawingAvatar});
        $("#sendDrawing").addClass("disabled");
        /*simpleBoard.resetBackground();
        swapToLightColor();*/
        drawingAvatar = false;
    }
});

$("#startGame").on("click", function(){
    if(!inputDisabled) {
        socket.emit("start_game", {room: roomID})
        $("#startGame").addClass("disabled");
    }
});

socket.on("waitingForAvatars", function(numPeople) {
    $("#startGame").hide();
    $("#startGame").removeClass("disabled");
    $("#messages").text("Waiting for " + numPeople + (numPeople>1?" people": " person"));
});

