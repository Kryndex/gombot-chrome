/*
*   main.js
*
*
*   Main file that creates the Gombot namespace.
*
*/

// Gombot is optional
var _Gombot = function(importedModules, Gombot) {

  Gombot = Gombot || {};

  function getModule(name) {
    if (typeof window !== "undefined" && typeof window[name] !== "undefined") {
      return window[name];
    }
    else if (typeof importedModules[name] !== "undefined") {
      return importedModules[name];
    }
    else {
      console.log("Error in getModule() can't find: "+name);
      throw "Can't find module: "+name;
    }
  }

  var Backbone = getModule("Backbone");
  var _ = getModule("_");

  // mixin guid creation into underscore
  _.mixin({
    guid: (function() {
      function S4() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
      };
      // Generate a pseudo-GUID by concatenating random hexadecimal.
      return function() {
        return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
      };
    })()
  });

  // These must be defined by importedModules
  Gombot.Messaging = importedModules.Messaging();
  Gombot.LocalStorage = importedModules.LocalStorage();

  Gombot.TldService = getModule("TldService")(getModule("Tld"), getModule("Uri"));
  Gombot.SiteConfigs = getModule("SiteConfigs");
  Gombot.Realms = getModule("Realms")(Gombot, Gombot.SiteConfigs, getModule("Uri"));
  Gombot.Storage = getModule("Storage")(Backbone, _, Gombot.LocalStorage); // defined by backbone.localStorage.js
  Gombot.GombotClient = getModule("GombotClient");
  Gombot.Sync = getModule("GombotSync")(Gombot, Backbone, _);
  Gombot.LoginCredential = getModule("LoginCredential")(Gombot, Backbone, _);
  Gombot.LoginCredentialCollection = getModule("LoginCredentialCollection")(Backbone, _, Gombot.LoginCredential); // LoginCredential need to be initialized
  Gombot.CapturedCredentialStorage = getModule("CapturedCredentialStorage")(Gombot, getModule("Uri"));
  Gombot.Linker = getModule("Linker")(Gombot);
  Gombot.CommandHandler = getModule("CommandHandler")(Gombot, Gombot.Messaging);

  var currentUser = null;
  Gombot.getCurrentUser = function() {
    return currentUser;
  };

  Gombot.setCurrentUser = function(user) {
    currentUser = user;
  };

  Gombot.clearCurrentUser = function(callback) {
    if (!currentUser) { callback(); return; }
    // TODO: revisit this after sync refactor. This has some gross abstractions going on.
    currentUser.destroy({ localOnly: true, success: function() { currentUser = null; callback(); }});
  };

  // new Gombot.Storage("users", function(store) {
  //   Gombot.User = User(Backbone, _, Gombot.LoginCredentialCollection, Gombot.Sync, store);
  //   Gombot.UserCollection = UserCollection(Backbone, _, Gombot.User, store);
  //   checkFirstRun();
  // });

  function checkFirstRun() {
    Gombot.LocalStorage.getItem("firstRun", function(firstRun) {
      initGombot(firstRun);
    });
  }

  function initGombot(firstRun) {
      Gombot.users = new Gombot.UserCollection();
      Gombot.users.fetch({
        success: function() {
          if (!firstRun) {
            if (window.startFirstRunFlow) {
              startFirstRunFlow(false /* showSignInPage */); // shows signup page on first run
              Gombot.LocalStorage.setItem("firstRun", true);
            } // TODO: fix this
          }
          var loggedInUser = Gombot.users.find(function(user) { return user.isAuthenticated() });
          if (loggedInUser) Gombot.setCurrentUser(loggedInUser);
      }});
  }
  return Gombot;
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = _Gombot; // export namespace constructor, for Firefox
}

// TODO: this below needs to be refactored

//
// Infobar notifications
//

function displayInfobar(notificationObj) {
  var infobarPaths = {
    password_observed: "/infobars/remember_password_infobar.html",
    update_password: "/infobars/update_password_infobar.html",
    signup_nag: "/infobars/signup_nag_infobar.html",
    pin_entry: "/infobars/pin_entry_infobar.html"
  };
  // Make sure we have a HTML infobar for this type of notification
  if (!infobarPaths[notificationObj.notification.type]) return;
  InfobarManager.run({
    path: infobarPaths[notificationObj.notification.type],
    tabId: notificationObj.tabID,
    height: '32px'
  }, genHandlerForNotification(notificationObj));

  function genHandlerForNotification(notificationObj) {
    return function(err,response) {
      if (err) {
        console.log(err);
        return;
      }
      if (!response.type) return;
      if (!infobarHooks[response.type]) {
        console.log('Infobar returned unknown response type!');
        return;
      }
      infobarHooks[response.type].call(infobarHooks,notificationObj,response);
    };
// <<<<<<< HEAD
//     // Make sure we have a HTML infobar for this type of notification
//     if (!infobarPaths[notificationObj.notification.type]) return;
//     InfobarManager.run({
//         path: infobarPaths[notificationObj.notification.type],
//         tabId: notificationObj.tabID,
//         height: '32px'
//     }, genHandlerForNotification(notificationObj));

//     function genHandlerForNotification(notificationObj) {
//         return function(err,response) {
//             if (err) {
//                 console.log(err);
//                 return;
//             }
//             if (!response.type) return;
//             if (!infobarHooks[response.type]) {
//                 console.log('Infobar returned unknown response type!');
//                 return;
//             }
//             infobarHooks[response.type].call(infobarHooks,notificationObj,response);
//         };
//     }
// =======
  }
}

// Test function that spawns an example infobar on the current active tab.
function testInfobarNotification() {
  getActiveTab(function(tab) {
    console.log("tab url: ", tab.url,'  ', tab);
    displayInfobar({
      notify: true,
      tabID: tab.id,
      notification: {
        type: 'pin_entry',
        formEl: {},
        formSubmitURL: "",
        hash: "bc74f4f071a5a33f00ab88a6d6385b5e6638b86c",
        hostname: "t.nm.io",
        httpRealm: null,
        password: "green",
        passwordField: {},
        type: "password_observed",
        username: "gombottest",
        usernameField: {}
      }
    });
  });
}

//
// PIN validation
//

function validatePIN(_pin) {
  // If there's no PIN set, accept. Otherwise, validate.
  var currentUser = Gombot.getCurrentUser();
  return (currentUser.get('pin') === _pin);
}
