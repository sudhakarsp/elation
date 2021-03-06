function AudioController(parent, args, extras) {
  this.parent = parent;
  this.args = args || {};
  this.checktimer = null;
  this.checktime = 10000;

  this.initialize = function(parent, args) {
      this.audio = document.createElement("AUDIO");
      this.updatestatus();
      this.checktimer = setInterval(this.updatestatus, this.checktime);

      if (this.audio && this.audio.play) {
          this.audio.src = "http://www.supercriticalindustries.com:8000/stream";
          this.audio.play();
          this.retrytime = 2000;
          this.lastrestart = new Date();

          elation.events.add(this.audio, "error", this);
          elation.events.add(this.audio, "abort", this);
          elation.events.add(this.audio, "empty", this);
          elation.events.add(this.audio, "emptied", this);
          elation.events.add(this.audio, "dataunavailable", this);
          elation.events.add(this.audio, "error", this);
          elation.events.add(this.audio, "ended", this);
          elation.events.add(this.audio, "waiting", this);
      } else {
          console.log("<audio> tag is not supported in your browser");
      }

      if (args.controls) {
          this.controls = document.getElementById(args.controls);
          var links = this.controls.getElementsByTagName("A");
          for (var i = 0; i < links.length; i++) {
              elation.events.add(links[i], "click", this);
          }
      }
  }
  this.pause = function() {
      elation.ajax.Get('/audio/playback/pause');
  }
  this.next = function() {
      elation.ajax.Get('/audio/playback/next');
      this.retry(true);
  }
  this.previous = function() {
      elation.ajax.Get('/audio/playback/previous');
      this.retry(true);
  }
  this.retry = function(force) {
      var now = new Date();
      if (force || (now - this.lastrestart >= this.retrytime)) {
          if (console) console.log("playing");
          this.audio.play();
          this.lastrestart = now;
      } else if (!this.retrytimeout) {
          (function(self) {
              var rtime = self.retrytime - ((now - self.lastrestart) || 0);
              self.retrytimeout = setTimeout(function() { self.retrytimeout = false; self.retry(); }, rtime);
          })(this);
      }
  }
  this.updatestatus = function() {
     if (elation.ajax) 
       elation.ajax.Get('/audio/playback.ajax');
  }

  this.handleEvent = function(ev) {
    switch(ev.type) {
      case 'error':
      case 'emptied':
      case 'ended':
        if (console) console.log("Restarting audio (" + ev.type + ")");
        this.retry();
        break;
      case 'waiting':
        if (console) console.log("Buffering...");
        break;
      case 'click':
        var el = $(ev.target);
        if (el.hasClass("media_action_previous_button"))
          this.previous();
        else if (el.hasClass("media_action_next_button"))
          this.next();
        else if (el.hasClass("media_action_pauseplay_button"))
          this.pause();
        break;
      default:
        alert(ev.type);
      }
  }

  this.initialize(parent, args);
}
