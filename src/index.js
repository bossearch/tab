import './style.css';

(function() {
// Default config
let CONFIG = {
  defaultCommand: 'dg',
  bgColor: '#1a1b26',
  textColor: '#f7768e',
  fontSize: '1.75em',
  clockSize: '2em',
  showClock: false,
  militaryClock: false,
  alwaysNewTab: false,
  gistID: '',
  links: [],
  caretColor: 'auto',
};
const DEFAULT_CONFIG = Object.assign({}, CONFIG);
let aliases = {
// alias: command
  'ddg': 'dg',
  '?': 'help'
}
let newTab = false;
let lastEnteredCommand = '';
let messageTimer = null;

window.onload = () => {
  loadConfig();
  applyConfig();
  saveConfig();

  document.querySelector('#input').focus();

  document.querySelector('body').addEventListener('click', () => {
    document.querySelector('#input').focus();
  });

  document.onkeydown = handleKeyDown;

  updateClock();
};

function evaluateInput() {
  let input = document.querySelector('#input').value.trim();
  document.querySelector('#input').value = '';
  clearMessage();

  // Input is empty
  if (input === '') return;

  // Save one-line history
  lastEnteredCommand = input;

  // Format input
  let args = input.split('/');
  let command = args[0].toLowerCase();
  for (let i=0; i < args.length; i++) {
    args[i] = args[i].trim();
  }

  // Check if valid command or alias
  const commandList = Object.keys(commands);
  const aliasList = Object.keys(aliases);
  let validCommand = false;
  for (let i=0; i < commandList.length; i++) {
    if (command === commandList[i]) {
      validCommand = true;
      args.shift(); // remove command from args
      break;
    } else if (command === aliasList[i]) {
      validCommand = true;
      command = aliases[command];
      args.shift();
      break;
    }
  }

  // Check if URL
  let isURL = false;
  if (checkIfURL(args[0])) {
    isURL = true;
    command = args.shift();
  }

  // Check if valid link
  let validLink = false;
  if (!isURL && !validCommand) { // ensure shortcut not taken
    for (let i=0; i < CONFIG.links.length; i++) {
      if (CONFIG.links[i].command == command) {
        validLink = true;
        command = args.shift();
        break;
      }
    }
  }

  // Check for newtab flag
  if (args[args.length - 1] === 'n') {
    newTab = true;
    args.pop(); // remove newtab flag
  }

  // Execute
  if (isURL) {
    redirect(buildURL(command));
  }

  else if (validCommand) {
    commands[command](args);
  }

  else if (validLink) {
    let link = getFullLink(command);
    if (args.length == 0) redirect(link.url)
    else redirect(link.url + link.search + args.join(' '));
  }

  else {
    commands[CONFIG['defaultCommand']](args);
  }

  return false;
}

// Opens a URL either in current or new tab
function redirect(url) {
  if (newTab || CONFIG.alwaysNewTab)
    window.open(url, '_blank').focus();
  else
    window.location.href = url;

  newTab = false;
  return false;
}

function loadConfig() {
  // Proceed if storage supported
  if (Storage) {
    // Create config object if it doesn't exist
    if (localStorage.getItem('taabSettings') === null) {
      localStorage.setItem('taabSettings', JSON.stringify(DEFAULT_CONFIG));
    // Otherwise load saved config from localStorage
    } else {
      const savedConfig = JSON.parse(localStorage.getItem('taabSettings'));
      // Merge new settings
      CONFIG = Object.assign(CONFIG, savedConfig);
    }

    // Legacy import
    if (localStorage.getItem('customCommands') !== null) {
      importLegacyLinks();
      localStorage.removeItem('customCommands');
    }
  }
}

function applyConfig() {
  // Text and background colors
  document.body.style.backgroundColor = CONFIG.bgColor;
  document.body.style.color = CONFIG.textColor;
  document.body.style.fontSize = CONFIG.fontSize;
  document.body.style.caretColor = CONFIG.caretColor;

  // Clock
  const clock = document.querySelector('#clock');
  clock.style.fontSize = CONFIG.clockSize;
  if (CONFIG.showClock)
    clock.style.display = 'inline';
  else
    clock.style.display = 'none';
}

function saveConfig() {
  // Write to localStorage
  localStorage.setItem('taabSettings', JSON.stringify(CONFIG));
}

function displayMessage(msg, timeMs) {
  let msgDiv = document.querySelector('#message');

  // Clear existing timer/message
  if (messageTimer) {
    msgDiv.innerHTML = '';
    clearTimeout(messageTimer);
  }

  // Display message
  msgDiv.innerHTML = msg;

  // Set timer
  messageTimer = setTimeout(() => {
    msgDiv.innerHTML = '';
  }, timeMs);
}

function clearMessage() { document.querySelector('#message').innerHTML = ''; }

// Adds protocol if not present, encodes search string
function buildURL(url, search='', query='') {
  let dest = (/(http(s)?:\/\/.)/.test(url))
    ? url
    : 'http://' + url;
  return dest + search + encodeURIComponent(query);
}

function updateClock() {
  let d = new Date();
  let h = d.getHours();
  if (!CONFIG.militaryClock && h > 12) h -= 12;
  let hours = h.toString();
  let minutes = ('0' + d.getMinutes()).slice(-2);
  document.querySelector('#clock').innerText = `${hours}:${minutes}`;
  setTimeout(updateClock, 1000);
}

function handleKeyDown(e) {
  let keycode = e.which || e.keyCode;

  // Enter key
  if (keycode === 13) {
    evaluateInput();
  }

  // Up arrow
  // Replace input text with last entered command
  else if (keycode === 38) {
    if (lastEnteredCommand !== '') {
      let input = document.querySelector('#input');
      input.focus();
      input.value = lastEnteredCommand;
      // Put cursor at end of text
      setTimeout(() => {
        input.setSelectionRange(input.value.length, input.value.length);
      }, 2);
    }
  }
}

function fetchGist(gistID) {
  let xhr = new XMLHttpRequest();
  let url = `https://api.github.com/gists/${gistID}`;
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4 && xhr.status == 200) {
      let files = JSON.parse(xhr.responseText).files;
      if (files.length > 1) {
        displayMessage('Error: Multiple files found in gist. Please use a gist with only one file.', 5000);
        return;
      }
      let gistText = files[Object.keys(files)[0]].content;
      updateConfig(gistText, gistID);
    }
  }
  xhr.open('GET', url, true);
  xhr.send(null);
}

function updateConfig(configString, gist) {
  let config;
  try {
    config = JSON.parse(configString);
  } catch (err) {
    displayMessage('Error parsing config, see console for details', 5000);
    console.log(err);
    return;
  }

  for (let setting in config) {
    CONFIG[setting] = config[setting];
  }
  CONFIG.gistID = gist;

  saveConfig();
  applyConfig();
  displayMessage('Config imported', 5000);
}

function checkIfURL(url) {
  if (/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/.test(url)) {
    if (!url.includes(' ')) {
      return true;
    }
  }
  return false;
}

// Get full link object from its shortcut
function getFullLink(shortcut) {
  for (let i=0; i < CONFIG.links.length; i++) {
    if (shortcut == CONFIG.links[i].command) {
      return CONFIG.links[i];
    }
  }
  return null;
}

// Import legacy links (custom commands)
function importLegacyLinks() {
  const legacyLinks = JSON.parse(localStorage.getItem('customCommands'));
  if (legacyLinks) {
    CONFIG.links = legacyLinks;
    saveConfig();
  }
}

const commands = {
  // Set
  'set': (args) => {
    // Validate hex color values.
    // #EBEBEB is valid, EBEBEB is not. #FFF is valid shorthand.
    const validHex = hex => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(hex)

    switch(args[0]) {
      // Default command
      case 'defaultCommand':
        // Display current value if none given
        if (args.length === 1) {
          displayMessage(`Default command: ${CONFIG.defaultCommand}`, 5000);
          break;
        }

        // Check if existant command
        if (Object.keys(commands).includes(args[1])) {
          CONFIG['defaultCommand'] = args[1];
          displayMessage(`Set default command to ${args[1]}`, 3000);
        } else {
          displayMessage(`Error: command ${args[1]} not found; default command not changed`, 10000);
        }
        break;

      // Background color
      case 'bgColor':
        // Display current value if none given
        if (args.length === 1) {
          displayMessage(`Current background color: ${CONFIG.bgColor}`, 8000);
          break;
        }

        // Set new background color
        if (validHex(args[1])) {
          CONFIG.bgColor = args[1];
        } else {
          displayMessage('Error: invalid hex value', 5000);
        }
        break;

      // Text color
      case 'textColor':
        // Display current value if none given
        if (args.length === 1) {
          displayMessage(`Current background color: ${CONFIG.textColor}`, 8000);
          break;
        }

        // Set new text color
        if (validHex(args[1])) {
          CONFIG['textColor'] = args[1];
        } else {
          displayMessage('Error: invalid hex value', 5000);
        }
        break;

      case 'caretColor':
        // Display current setting
        if (args.length === 1) {
          displayMessage(`Current caret color: ${CONFIG.caretColor}`, 8000);
          break;
        }

        // Set new value
        if (args[1]) CONFIG['caretColor'] = args[1];
        break;

      case 'fontSize':
        // Display current setting
        if (args.length === 1) {
          displayMessage(`Current input font size: ${CONFIG.fontSize}`, 8000);
          break;
        }

        // Set new value
        if (args[1]) CONFIG['fontSize'] = args[1];
        break;

      case 'clockSize':
        // Display current setting
        if (args.length === 1) {
          displayMessage(`Current clock font size: ${CONFIG.clockSize}`, 8000);
          break;
        }

        // Set new value
        if (args[1]) CONFIG['clockSize'] = args[1];
        break;

      // Always new tab
      case 'newtab':
      case 'alwaysNewTab':
        // Display current value if none given
        if (args.length === 1) {
          let msg = `alwaysNewTab is ${(CONFIG.alwaysNewTab) ?  'on' : 'off'}`;
          displayMessage(msg, 5000);
          break;
        }
        if (args[1] === 'on') CONFIG.alwaysNewTab = true;
        else if (args[1] === 'off') CONFIG.alwaysNewTab = false;
        else displayMessage("Must be set to either 'on' or 'off'", 5000);
        break;

      // Clock
      case 'clock':
        // Display current value if none given
        if (args.length === 1) {
          displayMessage(`Clock is ${(CONFIG.showClock) ? 'on' : 'off'},
            ${CONFIG.militaryClock ? '24' : '12'}-hour`, 5000);
          break;
        }

        // Set on/off, 12/24 hour
        switch(args[1]) {
          case 'on':
            CONFIG.showClock = true;
            break;
          case 'off':
            CONFIG.showClock = false;
            break;
          case '12':
            CONFIG.militaryClock = false;
            break;
          case '24':
            CONFIG.militaryClock = true;
            break;
          default:
            displayMessage("Must be set to 'on', 'off', '12' or '24'", 5000);
        }
        break;

      // Restore defaults
      case 'defaults':
        localStorage.removeItem('taabSettings');
        CONFIG = DEFAULT_CONFIG;
        loadConfig();
        applyConfig();
        saveConfig();
        displayMessage('Settings reset to defaults', 5000);
        break;

      default:
        displayMessage(`"${args[0]}" is not a valid setting`, 5000);
    }

    saveConfig();
    applyConfig();
  },

  // Links
  'link': (args) => {
    switch(args.length) {
      case 0:
        displayMessage(`link is a builtin command<br>To search for "link" try dg/link<br>`, 8000);
        break;

      case 1:
        // Show all links
        if (args[0] === 'show') {
          let msg = '';
          for (let i=0; i < CONFIG.links.length; i++) {
            let link = CONFIG.links[i];
            msg += `${link.command} --> ${link.url}`;
            if (link.search !== '') msg += ` (${link.search})`;
            msg += '<br>';
          }
          displayMessage(msg, 30000);
          break;
        }

        // Show specific (existent) link
        else {
          let link = getFullLink(args[0]);
          if (link) {
            let msg = `"${args[0]}" links to ${link.url}`;
            if (link.search !== '') msg += ` (${link.search})`;
            displayMessage(msg, 10000);
          }
          break;
        }

      case 2:
      case 3:
        // Delete
        if (args[1] === 'delete') {
          for (let i=0; i < CONFIG.links.length; i++) {
            if (args[0] == CONFIG.links[i].command) {
              CONFIG.links.splice(i, 1);
              displayMessage(`Link ${args[0]} deleted`, 5000);
            }
          }
        }

        // Add new
        else {
          // Ensure shortcut not taken
          for (let i=0; i < CONFIG.links.length; i++) {
            if (CONFIG.links[i].command == args[0]) {
              // Already using this shortcut, override?
              if (confirm('Overwrite existing shortcut?')) {
                // Remove existing shortcut if user says yes to avoid duplicate link commands
                for (let i=0; i < CONFIG.links.length; i++) {
                  if (CONFIG.links[i].command == args[0]) {
                    CONFIG.links.splice(i, 1);
                  }
                }
              } else {
                // Do nothing if user says no
                return;
              }
            }
          }
          if (Object.keys(commands).includes(args[0]) || Object.keys(aliases).includes(args[0])) {
            displayMessage(`Cannot override builtin command: ${args[0]}`, 5000);
            return;
          }

          // Check that URL is valid
          let url = buildURL(args[1]);
          if (checkIfURL(url)) {
            CONFIG.links.push({ 'command': args[0], 'url': url, 'search': args[2] || '' });
          } else {
            displayMessage('Invalid URL', 5000);
            return;
          }
        }
        break;
    }

    saveConfig();
  },

  // Config
  'config': (args) => {
    switch(args[0]) {
      case 'export':
        // Display config as string and select all of it
        displayMessage(localStorage.getItem('taabSettings'), 1000 * 25);
        window.getSelection().selectAllChildren(document.querySelector('#message'));
        break;

      case 'import':
        updateConfig(args[1]);
        break;

      case 'open':
        if (CONFIG.gistID !== '') {
          newTab = true;
          commands.gist([CONFIG.gistID]);
        } else {
          displayMessage('Error: No gist ID found. Make sure you have fetched your config at least once.', 8000);
        }
        break;

      case 'fetch':
        let gistID;
        if (args.length > 1) {
          try {
            gistID = args[1].match(/([0-9A-Za-z]{32})/)[0];
          } catch (err) {
            displayMessage('Error: unable to parse gist ID.<br>Try entering just the 32 character ID string.', 8000);
            return;
          }
        } else if (CONFIG.gistID != undefined) {
          gistID = CONFIG.gistID;
        } else {
          displayMessage('Error: no gist ID', 5000);
          break;
        }
        displayMessage('Fetching gist...', 2500);
        fetchGist(gistID);
        break;
    }
  },

  // Help
  'help': (args) => {
    newTab = true;
    redirect('https://github.com/koryschneider/tab#readme');
  },

  // Google
  'g': (args) => {
    const url = 'https://google.com', search = '/search?q=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args));
  },

  // DuckDuckGo
  'dg': (args) => {
    const url = 'https://duckduckgo.com', search = '/?q=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args));
  },

  // Reddit
  'r': (args) => {
    const url = 'https://reddit.com', search = '/r/';
    let query = (args.length > 0) ? args[0] : '';

    const validSort = (sort) => {
      return (['hot', 'new', 'rising', 'controversial', 'top', 'gilded', 'wiki', 'promoted'].includes(sort))
    };
    const validRange = (range) => {
      return (['day', 'week', 'month', 'year', 'all'].includes(range))
    };

    switch(args.length) {
      // Given nothing
      case 0:
        redirect(url);
        break;

      // Given a subreddit
      case 1:
        redirect(buildURL(url, search, args[0]));
        break;

      // Given subreddit and sort
      case 2:
        query += (validSort(args[1]))
          ? '/' + args[1]
          : '';
        redirect(url + search + query);
        break;

      // Given subreddit, sort and range
      case 3:
        if (['top', 'controversial'].includes(args[1])) {
          query += (validRange(args[2]))
            ? '/' + args[1] + '?t=' + args[2]
            : '';
        } else {
          query += (validSort(args[1]))
            ? '/' + args[1]
            : '';
        }
        redirect(url + search + query);
        break;
    }
  },

  // Hacker News
  'hn': (args) => {
    const url = 'https://news.ycombinator.com';
    if (args.length == 0) {
      redirect(url);
    } else {
      switch(args[0]) {
        case 'new':
          redirect(url + '/newest');
          break;

        case 'comments':
          redirect(url + '/newcomments');
          break;

        case 'show':
          redirect(url + '/show');
          break;

        case 'ask':
          redirect(url + '/ask');
          break;

        case 'jobs':
          redirect(url + '/jobs');
          break;

        case 'submit':
          redirect(url + '/submit');
          break;
      }
    }
  },

  // Youtube
  'yt': (args) => {
    const url = 'https://youtube.com', search = '/results?search_query=';
    if (args.length == 0) {
      redirect(url);
    } else {
      switch (args[0]) {
        case 'subs':
          redirect(url + '/feed/subscriptions');
          break;
        case 'hist':
          redirect(url + '/feed/history');
          break;
        case 'save':
          redirect(url + '/feed/playlist');
          break;
        case 'wl':
          redirect(url + '/playlist?list=WL');
          break;
        default:
          redirect(buildURL(url, search, args[0]));
      }
    }
  },

  // Wikipedia
  'w': (args) => {
    const url = 'https://wikipedia.org', search = '/w/index.php?title=Special:Search&search=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // GitHub
  'gh': (args) => {
    const baseUrl = 'https://github.com';
    if (args.length === 0) {
      redirect(baseUrl);
    } else if (args.length === 2) {
      redirect(`${baseUrl}/${args[0]}/${args[1]}/`);
    } else {
      redirect(`${baseUrl}/${args[0]}/`);
    }
  },

  // GitHub Gist
  'gist': (args) => {
    const url = 'https://gist.github.com', search = '/';
    if (args.length == 0) redirect(url)
    else redirect(url + search + args.join(''));
  },

  // Wolfram Alpha
  'wolf': (args) => {
    const url = 'http://wolframalpha.com', search = '/input/?i=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Netflix
  'n': (args) => {
    const url = 'https://netflix.com', search = '/search?q=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Internet Movie Database
  'imdb': (args) => {
    const url = 'http://imdb.com', search = '/find?s=all&q=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Google Maps
  'gmap': (args) => {
    const url = 'https://google.com/maps', search = '/search/';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Google Drive
  'gdrive': (args) => {
    const url = 'https://drive.google.com', search = '/drive/search?q=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Google Calendar
  'gcal': (args) => {
    redirect('https://calendar.google.com');
  },

  // Google Images
  'gimg': (args) => {
    const url = 'https://google.com', search = '/search?tbm=isch&q=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Gmail
  'gmail': (args) => {
    const url = 'https://mail.google.com', search = '/mail/u/0/#search/';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Google Keep
  'gkeep': (args) => {
    const url = 'https://keep.google.com', search = '/#search/text=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Dictionary
  'dict': (args) => {
    const url = 'http://dictionary.com', search = '/browse/';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Thesaurus
  'thes': (args) => {
    const url = 'http://thesaurus.com', search = '/browse/';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Tokopedia
  'tokped': (args) => {
    const url = 'https://tokopedia.com', search = '/search?q=';
    if (args.length == 0) {
      redirect(url);
    } else {
      switch (args[0]) {
        case 'wish':
          redirect(url + '/wishlist');
          break;
        case 'cart':
          redirect(url + '/cart');
          break;
        case 'chat':
          redirect(url + '/chat');
          break;
        case 'order':
          redirect(url + '/order-list');
          break;
        default:
          redirect(buildURL(url, search, args[0]));
      }
    }
  },

  // QMK
  'qmk': (args) => {
    if (args.length == 0) {
      redirect('https://github.com/qmk/qmk_firmware');
    } else {
      switch (args[0]) {
        case 'wiki':
          redirect('https://docs.qmk.fm/');
          break;
        case 'conf':
          redirect('https://config.qmk.fm/#/crkbd/rev1/LAYOUT_split_3x6_3');
          break;
      }
    }
  },

  // Deepl
  'dpl': (args) => {
    const baseUrl = 'https://www.deepl.com/en/translator';
    if (args.length === 0) {
      redirect(baseUrl);
    } else if (args.length === 1) {
      redirect(`${baseUrl}#${args[0]}/`);
    } else if (args.length === 2) {
      redirect(`${baseUrl}#${args[0]}/${args[1]}/`);
    } else {
      redirect(`${baseUrl}#${args[0]}/${args[1]}/`);
    }
  },

  // Twitter
  'x': (args) => {
    const url = 'https://x.com', search = '/search?q=';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // Idlix
  'idlix': (args) => {
    const url = 'https://tv3.idlix.asia', search = '/search/';
    if (args.length == 0) redirect(url)
    else redirect(buildURL(url, search, args.join(' ')));
  },

  // ChatGPT
  'gpt': (args) => {
    redirect('https://chatgpt.com');
  },

  // Blackbox
  'bb': (args) => {
    redirect('https://blackbox.ai');
  },

  // Proton Mail
  'pmail': (args) => {
    redirect('https://mail.proton.me/u/0/inbox');
  },

  // Proton Calendar
  'pcal': (args) => {
    redirect('https://calendar.proton.me');
  },

  // Proton Pass
  'pass': (args) => {
    redirect('https://pass.proton.me');
  },

  // Proton Drive
  'pdrive': (args) => {
    redirect('https://drive.proton.me');
  },

  // Twitch
  'tw': (args) => {
    redirect('https://www.twitch.tv/');
  }
}
})() // closure
