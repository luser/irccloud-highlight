/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */
/*global _, Backbone, SESSION, SESSIONVIEW */
// ==UserScript==
// @name irccloud highlights buffer
// @namespace https://github.com/luser/irccloud-highlight
// @description Add a buffer to each connection to show highlights
// @downloadURL https://raw.githubusercontent.com/luser/irccloud-highlight/master/irccloud_highlights.user.js
// @version 1
// @match https://www.irccloud.com/*
// @match https://irccloud.mozilla.com/*
// @noframes
// @grant none
// ==/UserScript==

(function() {
  var Child = null;
  var ChildView = null;
  var ChildStatusView = null;
  var BufferListChildView = null;

  function gotAllTypes() {
    return Child && ChildView && ChildStatusView && BufferListChildView;
  }

  function tryGetTypes() {
    // Yank out some types. This would be a lot easier if the original
    // modules were exposed via webpack!
    if (SESSION.buffers.length > 0) {
      var b = SESSION.buffers.first();
      Child = b.__proto__.__proto__.constructor;
      var v = SESSIONVIEW.mainArea.buffers[b.id];
      ChildView = v.__proto__.__proto__.constructor;
      ChildStatusView = v.status.__proto__.__proto__.constructor;
    }
    var bufconns = _.values(SESSIONVIEW.sidebar.bufferList.connections);
    if (bufconns.length > 0) {
      var blcv = bufconns[0];
      var chanviews = _.filter(blcv.buffers, function (v) { return v.el.classList.contains("channel"); });
      if (chanviews.length > 0) {
        var blv = chanviews[0];
        BufferListChildView = blv.__proto__.__proto__.constructor;
      }
    }
    return gotAllTypes();
  }

  function init() {
    console.log('highlights: init');
    var ma = SESSIONVIEW.mainArea;
    ma.model.buffers.unbind('add', ma.renderBuffer, ma);
    function renderBuffer(buffer) {
      var options = {
        model: buffer
      };
      if (!(buffer instanceof Highlights)) {
        ma.renderBuffer.call(ma, buffer);
        return;
      }

      var view = new HighlightsView(options);
      this.buffers[buffer.id] = view;

      buffer.bind('selectedChange', function () {
        if (buffer.isSelected()) {
          this.current = view;
          this.timeLayoutChange();
        }
      }, this);

      view.bind('addOverlay', this.renderCurrentOverlay, this);

      this.buffersContainer.append(view.el);
    }
    ma.model.buffers.bind('add', renderBuffer, ma);

    var HighlightMessage = null;

    var Highlights = Child.extend.call(Child, {
      defaults: {
        name: 'highlights'
      },
      initialize: function (data, options) {
        Child.prototype.initialize.apply(this, arguments);
        this.bindMessageHandlers();
      },
      bindMessageHandlers: function () {
        for (var type in this.message_handlers) {
          this.connection.buffers.bind('notableMessage:' + type, this.handleMessage, this);
        }
      },
      handleMessage: function (message) {
        this.message_handlers[message.get('type')].call(this, message);
      },
      message_handlers: {
        buffer_msg: function (message) {
          this.messages.add(message);
        },
        buffer_me_msg: function (message) {
          this.messages.add(message);
        }
      },
      isConversation: function() {
        return false;
      }
    });

    var NoBufferInputView = Backbone.View.extend({
      focus: function() {},
      blur: function() {},
      isSlashCommand: function() { return false; },
      tabComplete: {
        makeChoice: function() {},
        makeOriginalChoice: function() {}
      }
    });

    var HighlightsView = ChildView.extend.call(ChildView, {
      className: ChildView.prototype.className + ' highlights',
      initialize: function (options) {
        ChildView.prototype.initialize.apply(this, arguments);
        this.status = new ChildStatusView(options);
        this.input = new NoBufferInputView(options);
        var formatter = this.scroll.log.lineRenderer.formatter;
        var oldLinkMessageUser = formatter.linkMessageUser;
        formatter.linkMessageUser = function (author, message, options) {
          var chan = message.get('chan');
          console.log(`formatter.linkMessageUser: ${author} ${chan}`);
          return oldLinkMessageUser.call(formatter, author, message, options) + ' ' + formatter.linkChannel(chan, null, chan);
        };
      }
    });

    var BufferListHighlightsView = BufferListChildView.extend.call(BufferListChildView, {
      className: BufferListChildView.prototype.className + ' channel'
    });

    function renderHighlights(highlights) {
      var blhv = new BufferListHighlightsView({
        el: this.heading,
        model: highlights
      });
      this.renderBufferView(blhv);
      return this;
    }

    function addHighlights(conn) {
      var highlights = new Highlights({}, {
        connection: conn,
        session: conn.session
      });
      highlights.id = highlights.cid;
      conn.highlights = highlights;
      conn.addBuffer(highlights);
      var buflistconnview = SESSIONVIEW.sidebar.bufferList.connections[conn.id];
      renderHighlights.call(buflistconnview, highlights);
      return highlights;
    }

    SESSION.connections.each(addHighlights);
    SESSION.connections.bind('add', addHighlights);
  }

  function tryInit() {
    if (gotAllTypes() || tryGetTypes()) {
      init();
    } else {
      // Try again later, I guess.
      window.setTimeout(tryInit, 100);
    }
  }

  (function checkSession() {
    if (window.hasOwnProperty('SESSION')) {
      if (window.SESSION.streamConnected) {
        tryInit();
      } else {
        window.SESSION.once('streamConnectedChange', tryInit);
      }
    } else {
      window.setTimeout(checkSession, 100);
    }
  })();

})();
