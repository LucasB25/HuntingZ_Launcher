/**
 * Script for landing.ejs
 */
// Requirements
const cp = require("child_process");
const crypto = require("crypto");
const { URL } = require("url");
const { MojangRestAPI, getServerStatus } = require("helios-core/mojang");

// Internal Requirements
const DiscordWrapper = require("./assets/js/discordwrapper");
const ProcessBuilder = require("./assets/js/processbuilder");
const {
  RestResponseStatus,
  isDisplayableError,
} = require("helios-core/common");

// Launch Elements
const launch_content = document.getElementById("launch_content");
const launch_details = document.getElementById("launch_details");
const launch_progress = document.getElementById("launch_progress");
const launch_progress_label = document.getElementById("launch_progress_label");
const launch_details_text = document.getElementById("launch_details_text");
const server_selection_button = document.getElementById(
  "server_selection_button"
);
const user_text = document.getElementById("user_text");

const loggerLanding = LoggerUtil1(
  "%c[Landing]",
  "color: #000668; font-weight: bold"
);

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 *
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading) {
  if (loading) {
    launch_details.style.display = "flex";
    launch_content.style.display = "none";
  } else {
    launch_details.style.display = "none";
    launch_content.style.display = "inline-flex";
  }
}

/**
 * Set the details text of the loading area.
 *
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details) {
  launch_details_text.innerHTML = details;
}

/**
 * Set the value of the loading progress bar and display that value.
 *
 * @param {number} value The progress value.
 * @param {number} max The total size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setLaunchPercentage(value, max, percent = (value / max) * 100) {
  launch_progress.setAttribute("max", max);
  launch_progress.setAttribute("value", value);
  launch_progress_label.innerHTML = percent + "%";
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 *
 * @param {number} value The progress value.
 * @param {number} max The total download size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setDownloadPercentage(value, max, percent = (value / max) * 100) {
  remote.getCurrentWindow().setProgressBar(value / max);
  setLaunchPercentage(value, max, percent);
}

/**
 * Enable or disable the launch button.
 *
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val) {
  document.getElementById("launch_button").disabled = !val;
}

// Bind launch button
document
  .getElementById("launch_button")
  .addEventListener("click", function (e) {
    loggerLanding.log("Launching game..");
    const mcVersion = DistroManager.getDistribution()
      .getServer(ConfigManager.getSelectedServer())
      .getMinecraftVersion();
    const jExe = ConfigManager.getJavaExecutable();
    if (jExe == null) {
      asyncSystemScan(mcVersion);
    } else {
      setLaunchDetails(Lang.queryJS("landing.launch.pleaseWait"));
      toggleLaunchArea(true);
      setLaunchPercentage(0, 100);

      const jg = new JavaGuard(mcVersion);
      jg._validateJavaBinary(jExe).then((v) => {
        loggerLanding.log("Java version meta", v);
        if (v.valid) {
          dlAsync();
        } else {
          asyncSystemScan(mcVersion);
        }
      });
    }
  });

// Bind settings button
document.getElementById("settingsMediaButton").onclick = (e) => {
  prepareSettings();
  switchView(getCurrentView(), VIEWS.settings);
};

// Bind avatar overlay button.
document.getElementById("avatarOverlay").onclick = (e) => {
  prepareSettings();
  switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
    settingsNavItemListener(
      document.getElementById("settingsNavAccount"),
      false
    );
  });
};

// Bind selected account
function updateSelectedAccount(authUser) {
  let username = "No Account Selected";
  if (authUser != null) {
    if (authUser.displayName != null) {
      username = authUser.displayName;
    }
    if (authUser.uuid != null) {
      document.getElementById(
        "avatarContainer"
      ).style.backgroundImage = `url('https://mc-heads.net/body/${authUser.uuid}/right')`;
    }
  }
  user_text.innerHTML = username;
}
updateSelectedAccount(ConfigManager.getSelectedAccount());

// Bind selected server
function updateSelectedServer(serv) {
  if (getCurrentView() === VIEWS.settings) {
    saveAllModConfigurations();
  }
  ConfigManager.setSelectedServer(serv != null ? serv.getID() : null);
  ConfigManager.save();
  server_selection_button.innerHTML =
    "\u2022 " + (serv != null ? serv.getName() : "No Server Selected");
  if (getCurrentView() === VIEWS.settings) {
    animateModsTabRefresh();
  }
  setLaunchEnabled(serv != null);
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = "\u2022 Loading..";
server_selection_button.onclick = (e) => {
  e.target.blur();
  toggleServerSelection(true);
};

// Update Mojang Status Color
const refreshMojangStatuses = async function () {
  loggerLanding.log("Refreshing Mojang Statuses..");

  let status = "grey";
  let tooltipEssentialHTML = "";
  let tooltipNonEssentialHTML = "";

  const response = await MojangRestAPI.status();
  let statuses;
  if (response.responseStatus === RestResponseStatus.SUCCESS) {
    statuses = response.data;
  } else {
    loggerLanding.warn("Unable to refresh Mojang service status.");
    statuses = MojangRestAPI.getDefaultStatuses();
  }

  greenCount = 0;
  greyCount = 0;

  for (let i = 0; i < statuses.length; i++) {
    const service = statuses[i];

    if (service.essential) {
      tooltipEssentialHTML += `<div class="mojangStatusContainer">
                <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(
                  service.status
                )};">&#8226;</span>
                <span class="mojangStatusName">${service.name}</span>
            </div>`;
    } else {
      tooltipNonEssentialHTML += `<div class="mojangStatusContainer">
                <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(
                  service.status
                )};">&#8226;</span>
                <span class="mojangStatusName">${service.name}</span>
            </div>`;
    }

    if (service.status === "yellow" && status !== "red") {
      status = "yellow";
    } else if (service.status === "red") {
      status = "red";
    } else {
      if (service.status === "grey") {
        ++greyCount;
      }
      ++greenCount;
    }
  }

  if (greenCount === statuses.length) {
    if (greyCount === statuses.length) {
      status = "grey";
    } else {
      status = "green";
    }
  }

  document.getElementById("mojangStatusEssentialContainer").innerHTML =
    tooltipEssentialHTML;
  document.getElementById("mojangStatusNonEssentialContainer").innerHTML =
    tooltipNonEssentialHTML;
  document.getElementById("mojang_status_icon").style.color =
    MojangRestAPI.statusToHex(status);
};

const refreshServerStatus = async function (fade = false) {
  loggerLanding.log("Refreshing Server Status");
  const serv = DistroManager.getDistribution().getServer(
    ConfigManager.getSelectedServer()
  );

  let pLabel = "SERVEUR";
  let pVal = "FERM??";

  try {
    const serverURL = new URL("my://" + serv.getAddress());

    const servStat = await getServerStatus(
      47,
      serverURL.hostname,
      Number(serverURL.port)
    );

    pLabel = "JOUEURS";
    pVal = servStat.players.online + "/" + servStat.players.max;
  } catch (err) {
    loggerLanding.warn("Unable to refresh server status, assuming offline.");
    loggerLanding.debug(err);
  }
  if (fade) {
    $("#server_status_wrapper").fadeOut(250, () => {
      document.getElementById("landingPlayerLabel").innerHTML = pLabel;
      document.getElementById("player_count").innerHTML = pVal;
      $("#server_status_wrapper").fadeIn(500);
    });
  } else {
    document.getElementById("landingPlayerLabel").innerHTML = pLabel;
    document.getElementById("player_count").innerHTML = pVal;
  }
};

// refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Set refresh rate to once every 5 minutes.
// let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 300000)
// Refresh statuses every hour. The status page itself refreshes every day so...
let mojangStatusListener = setInterval(
  () => refreshMojangStatuses(true),
  60 * 60 * 1000
);

/**
 * Shows an error overlay, toggles off the launch area.
 *
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc) {
  setOverlayContent(title, desc, "Okay");
  setOverlayHandler(null);
  toggleOverlay(true);
  toggleLaunchArea(false);
}

/* System (Java) Scan */

let sysAEx;
let scanAt;

let extractListener;

/**
 * Asynchronously scan the system for valid Java installations.
 *
 * @param {string} mcVersion The Minecraft version we are scanning for.
 * @param {boolean} launchAfter Whether we should begin to launch after scanning.
 */
function asyncSystemScan(mcVersion, launchAfter = true) {
  setLaunchDetails("Veuillez patienter..");
  toggleLaunchArea(true);
  setLaunchPercentage(0, 100);

  const loggerSysAEx = LoggerUtil1(
    "%c[SysAEx]",
    "color: #353232; font-weight: bold"
  );

  const forkEnv = JSON.parse(JSON.stringify(process.env));
  forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory();

  // Fork a process to run validations.
  sysAEx = cp.fork(
    path.join(__dirname, "assets", "js", "assetexec.js"),
    ["JavaGuard", mcVersion],
    {
      env: forkEnv,
      stdio: "pipe",
    }
  );
  // Stdout
  sysAEx.stdio[1].setEncoding("utf8");
  sysAEx.stdio[1].on("data", (data) => {
    loggerSysAEx.log(data);
  });
  // Stderr
  sysAEx.stdio[2].setEncoding("utf8");
  sysAEx.stdio[2].on("data", (data) => {
    loggerSysAEx.log(data);
  });

  sysAEx.on("message", (m) => {
    if (m.context === "validateJava") {
      if (m.result == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
          "No Compatible<br>Java Installation Found",
          "Pour rejoindre HuntingZ, vous avez besoin d'une installation 64 bits de Java 8. Voulez-vous que nous en installions une copie ?",
          "Installer Java",
          "Installer Manuellement"
        );
        setOverlayHandler(() => {
          setLaunchDetails("Pr??paration du t??l??chargement de Java..");
          sysAEx.send({
            task: "changeContext",
            class: "AssetGuard",
            args: [
              ConfigManager.getCommonDirectory(),
              ConfigManager.getJavaExecutable(),
            ],
          });
          sysAEx.send({
            task: "execute",
            function: "_enqueueOpenJDK",
            argsArr: [ConfigManager.getDataDirectory()],
          });
          toggleOverlay(false);
        });
        setDismissHandler(() => {
          $("#overlayContent").fadeOut(250, () => {
            //$('#overlayDismiss').toggle(false)
            setOverlayContent(
              "Java est Requis<br>pour lancer",
              'Une installation x64 de Java 8 est requise pour lancer le jeu.<br><br>R??f??rez vous au <a href="https://github.com/dscalzi/HeliosLauncher/wiki/Java-Management#manually-installing-a-valid-version-of-java">guide</a> pour suivre les instructions d installations de Java.',
              "I Understand",
              "Go Back"
            );
            setOverlayHandler(() => {
              toggleLaunchArea(false);
              toggleOverlay(false);
            });
            setDismissHandler(() => {
              toggleOverlay(false, true);
              asyncSystemScan();
            });
            $("#overlayContent").fadeIn(250);
          });
        });
        toggleOverlay(true, true);
      } else {
        // Java installation found, use this to launch the game.
        ConfigManager.setJavaExecutable(m.result);
        ConfigManager.save();

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = m.result;
        populateJavaExecDetails(settingsJavaExecVal.value);

        if (launchAfter) {
          dlAsync();
        }
        sysAEx.disconnect();
      }
    } else if (m.context === "_enqueueOpenJDK") {
      if (m.result === true) {
        // Oracle JRE enqueued successfully, begin download.
        setLaunchDetails("T??l??chargement de Java..");
        sysAEx.send({
          task: "execute",
          function: "processDlQueues",
          argsArr: [[{ id: "java", limit: 1 }]],
        });
      } else {
        // Oracle JRE enqueue failed. Probably due to a change in their website format.
        // User will have to follow the guide to install Java.
        setOverlayContent(
          "Probl??me inattendu:<br>??chec du t??l??chargement de Java",
          "Malheureusement, nous avons rencontr?? un probl??me lors de la tentative d'installation de Java. Vous devrez installer manuellement une copie. Veuillez consulter notre <a href=\"https://github.com/dscalzi/HeliosLauncher/wiki\">Guide de d??pannage</a> pour plus de d??tails et d'instructions.",
          "'ai compris"
        );
        setOverlayHandler(() => {
          toggleOverlay(false);
          toggleLaunchArea(false);
        });
        toggleOverlay(true);
        sysAEx.disconnect();
      }
    } else if (m.context === "progress") {
      switch (m.data) {
        case "download":
          // Downloading..
          setDownloadPercentage(m.value, m.total, m.percent);
          break;
      }
    } else if (m.context === "complete") {
      switch (m.data) {
        case "download": {
          // Show installing progress bar.
          remote.getCurrentWindow().setProgressBar(2);

          // Wait for extration to complete.
          const eLStr = "Extracting";
          let dotStr = "";
          setLaunchDetails(eLStr);
          extractListener = setInterval(() => {
            if (dotStr.length >= 3) {
              dotStr = "";
            } else {
              dotStr += ".";
            }
            setLaunchDetails(eLStr + dotStr);
          }, 750);
          break;
        }
        case "java":
          // Download & extraction complete, remove the loading from the OS progress bar.
          remote.getCurrentWindow().setProgressBar(-1);

          // Extraction completed successfully.
          ConfigManager.setJavaExecutable(m.args[0]);
          ConfigManager.save();

          if (extractListener != null) {
            clearInterval(extractListener);
            extractListener = null;
          }

          setLaunchDetails("Java Install?? !");

          if (launchAfter) {
            dlAsync();
          }

          sysAEx.disconnect();
          break;
      }
    } else if (m.context === "error") {
      console.log(m.error);
    }
  });

  // Begin system Java scan.
  setLaunchDetails("V??rification des informations syst??me..");
  sysAEx.send({
    task: "execute",
    function: "validateJava",
    argsArr: [ConfigManager.getDataDirectory()],
  });
}

// Keep reference to Minecraft Process
let proc;
// Is DiscordRPC enabled
let hasRPC = false;
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/;
const GAME_LAUNCH_REGEX =
  /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+)$/;
const MIN_LINGER = 5000;

let aEx;
let serv;
let versionData;
let forgeData;

let progressListener;

function dlAsync(login = true) {
  // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
  // launching the game.

  if (login) {
    if (ConfigManager.getSelectedAccount() == null) {
      loggerLanding.error("Vous devez ??tre connect?? ?? un compte.");
      return;
    }
  }

  setLaunchDetails("Please wait..");
  toggleLaunchArea(true);
  setLaunchPercentage(0, 100);

  const loggerAEx = LoggerUtil1("%c[AEx]", "color: #353232; font-weight: bold");
  const loggerLaunchSuite = LoggerUtil1(
    "%c[LaunchSuite]",
    "color: #000668; font-weight: bold"
  );

  const forkEnv = JSON.parse(JSON.stringify(process.env));
  forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory();

  // Start AssetExec to run validations and downloads in a forked process.
  aEx = cp.fork(
    path.join(__dirname, "assets", "js", "assetexec.js"),
    [
      "AssetGuard",
      ConfigManager.getCommonDirectory(),
      ConfigManager.getJavaExecutable(),
    ],
    {
      env: forkEnv,
      stdio: "pipe",
    }
  );
  // Stdout
  aEx.stdio[1].setEncoding("utf8");
  aEx.stdio[1].on("data", (data) => {
    loggerAEx.log(data);
  });
  // Stderr
  aEx.stdio[2].setEncoding("utf8");
  aEx.stdio[2].on("data", (data) => {
    loggerAEx.log(data);
  });
  aEx.on("error", (err) => {
    loggerLaunchSuite.error("Error during launch", err);
    showLaunchFailure(
      "Erreur de Lancement",
      err.message ||
        "Ouvrez la console (CTRL + Shift + i) pour plus de d??tails."
    );
  });
  aEx.on("close", (code, signal) => {
    if (code !== 0) {
      loggerLaunchSuite.error(
        `AssetExec exited with code ${code}, assuming error.`
      );
      showLaunchFailure(
        "Erreur de Lancement",
        "Ouvrez la console (CTRL + Shift + i) pour plus de d??tails."
      );
    }
  });

  // Establish communications between the AssetExec and current process.
  aEx.on("message", (m) => {
    if (m.context === "validate") {
      switch (m.data) {
        case "distribution":
          setLaunchPercentage(20, 100);
          loggerLaunchSuite.log("Indice de distribution valid??.");
          setLaunchDetails("Loading version information..");
          break;
        case "version":
          setLaunchPercentage(40, 100);
          loggerLaunchSuite.log("Donn??es de la version charg??e.");
          setLaunchDetails("Validation des donn??es..");
          break;
        case "assets":
          setLaunchPercentage(60, 100);
          loggerLaunchSuite.log("Asset Validation Complete");
          setLaunchDetails("Validation des biblioth??ques..");
          break;
        case "libraries":
          setLaunchPercentage(80, 100);
          loggerLaunchSuite.log("Library validation complete.");
          setLaunchDetails("Validation de divers fichiers..");
          break;
        case "files":
          setLaunchPercentage(100, 100);
          loggerLaunchSuite.log("File validation complete.");
          setLaunchDetails("T??l??chargement des fichiers..");
          break;
      }
    } else if (m.context === "progress") {
      switch (m.data) {
        case "assets": {
          const perc = (m.value / m.total) * 20;
          setLaunchPercentage(40 + perc, 100, parseInt(40 + perc));
          break;
        }
        case "download":
          setDownloadPercentage(m.value, m.total, m.percent);
          break;
        case "extract": {
          // Show installing progress bar.
          remote.getCurrentWindow().setProgressBar(2);

          // Download done, extracting.
          const eLStr = "Extraction des biblioth??ques";
          let dotStr = "";
          setLaunchDetails(eLStr);
          progressListener = setInterval(() => {
            if (dotStr.length >= 3) {
              dotStr = "";
            } else {
              dotStr += ".";
            }
            setLaunchDetails(eLStr + dotStr);
          }, 750);
          break;
        }
      }
    } else if (m.context === "complete") {
      switch (m.data) {
        case "download":
          // Download and extraction complete, remove the loading from the OS progress bar.
          remote.getCurrentWindow().setProgressBar(-1);
          if (progressListener != null) {
            clearInterval(progressListener);
            progressListener = null;
          }

          setLaunchDetails("Pr??paration du lancement..");
          break;
      }
    } else if (m.context === "error") {
      switch (m.data) {
        case "download":
          loggerLaunchSuite.error("Erreur lors du t??l??chargement:", m.error);

          if (m.error.code === "ENOENT") {
            showLaunchFailure(
              "Erreur de t??l??chargement",
              "Impossible de se connecter au serveur de fichiers. Assurez-vous que vous ??tes connect?? ?? internet et r??essayez."
            );
          } else {
            showLaunchFailure(
              "Erreur de t??l??chargement",
              "Veuillez ouvrir la console (CTRL + Shift + i) pour plus de d??tails."
            );
          }

          remote.getCurrentWindow().setProgressBar(-1);

          // Disconnect from AssetExec
          aEx.disconnect();
          break;
      }
    } else if (m.context === "validateEverything") {
      let allGood = true;

      // If these properties are not defined it's likely an error.
      if (m.result.forgeData == null || m.result.versionData == null) {
        loggerLaunchSuite.error("Erreur durant la v??rification:", m.result);

        loggerLaunchSuite.error("Erreur de lancement", m.result.error);
        showLaunchFailure(
          "Erreur de lancement",
          "Veuillez ouvrir la console (CTRL + Shift + i) pour plus de d??tails."
        );

        allGood = false;
      }

      forgeData = m.result.forgeData;
      versionData = m.result.versionData;

      if (login && allGood) {
        const authUser = ConfigManager.getSelectedAccount();
        loggerLaunchSuite.log(
          `Sending selected account (${authUser.displayName}) to ProcessBuilder.`
        );
        let pb = new ProcessBuilder(
          serv,
          versionData,
          forgeData,
          authUser,
          remote.app.getVersion()
        );
        setLaunchDetails("Lancement du jeu..");

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const SERVER_JOINED_REGEX = new RegExp(
          `\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`
        );

        const onLoadComplete = () => {
          toggleLaunchArea(false);
          if (hasRPC) {
            DiscordWrapper.updateDetails("Chargement du jeu..");
          }
          proc.stdout.on("data", gameStateChange);
          proc.stdout.removeListener("data", tempListener);
          proc.stderr.removeListener("data", gameErrorListener);
        };
        const start = Date.now();

        // Attach a temporary listener to the client output.
        // Will wait for a certain bit of text meaning that
        // the client application has started, and we can hide
        // the progress bar stuff.
        const tempListener = function (data) {
          if (GAME_LAUNCH_REGEX.test(data.trim())) {
            const diff = Date.now() - start;
            if (diff < MIN_LINGER) {
              setTimeout(onLoadComplete, MIN_LINGER - diff);
            } else {
              onLoadComplete();
            }
          }
        };

        // Listener for Discord RPC.
        const gameStateChange = function (data) {
          data = data.trim();
          if (SERVER_JOINED_REGEX.test(data)) {
            DiscordWrapper.updateDetails("Explore le royaume !");
          } else if (GAME_JOINED_REGEX.test(data)) {
            DiscordWrapper.updateDetails("En route vers un Nouveau Monde !");
          }
        };

        const gameErrorListener = function (data) {
          data = data.trim();
          if (
            data.indexOf(
              "Could not find or load main class net.minecraft.launchwrapper.Launch"
            ) > -1
          ) {
            loggerLaunchSuite.error(
              "Le lancement du jeu a ??chou??, le fichier principal, LaunchWrapper n'a pas ??t?? t??l??charg?? correctement."
            );
            showLaunchFailure(
              "Le lancement du jeu a ??chou??",
              "Le fichier principal, LaunchWrapper, n'a pas ??t?? t??l??charg?? correctement. Par cons??quent, le jeu ne peut pas ??tre lanc??.<br><br>Pour r??soudre ce probl??me, d??sactivez temporairement votre logiciel antivirus et relancez le jeu.<br><br>Si vous avez le temps, rejoignez le <a href=\"https://discord.gg/DqPxskbjCx\">discord</a> et ouvrez un ticket pour nous faire savoir quel logiciel antivirus vous utilisez. Nous allons les contacter et essayer d'arranger les choses."
            );
          }
        };

        try {
          // Build Minecraft process.
          proc = pb.build();

          // Bind listeners to stdout.
          proc.stdout.on("data", tempListener);
          proc.stderr.on("data", gameErrorListener);

          setLaunchDetails("Lancement du jeu..");

          // Init Discord Hook
          const distro = DistroManager.getDistribution();
          if (distro.discord != null && serv.discord != null) {
            DiscordWrapper.initRPC(distro.discord, serv.discord);
            hasRPC = true;
            proc.on("close", (code, signal) => {
              loggerLaunchSuite.log("Shutting down Discord Rich Presence..");
              DiscordWrapper.shutdownRPC();
              hasRPC = false;
              proc = null;
            });
          }
        } catch (err) {
          loggerLaunchSuite.error("Error during launch", err);
          showLaunchFailure(
            "Erreur durant le lancement",
            "Veuillez v??rifier la console (CTRL + Shift + i) pour plus de d??tails."
          );
        }
      }

      // Disconnect from AssetExec
      aEx.disconnect();
    }
  });

  // Begin Validations

  // Validate Forge files.
  setLaunchDetails("Chargement des informations sur le serveur..");

  refreshDistributionIndex(
    true,
    (data) => {
      onDistroRefresh(data);
      serv = data.getServer(ConfigManager.getSelectedServer());
      aEx.send({
        task: "execute",
        function: "validateEverything",
        argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()],
      });
    },
    (err) => {
      loggerLaunchSuite.log(
        "Erreur lors de la r??cup??ration d'une nouvelle copie de l'index de distribution.",
        err
      );
      refreshDistributionIndex(
        false,
        (data) => {
          onDistroRefresh(data);
          serv = data.getServer(ConfigManager.getSelectedServer());
          aEx.send({
            task: "execute",
            function: "validateEverything",
            argsArr: [
              ConfigManager.getSelectedServer(),
              DistroManager.isDevMode(),
            ],
          });
        },
        (err) => {
          loggerLaunchSuite.error("Unable to refresh distribution index.", err);
          if (DistroManager.getDistribution() == null) {
            showLaunchFailure(
              "Erreur Fatale",
              "Impossible de charger une copie de l'index de distribution. Consultez la console (CTRL + Shift + i) pour plus de d??tails."
            );

            // Disconnect from AssetExec
            aEx.disconnect();
          } else {
            serv = data.getServer(ConfigManager.getSelectedServer());
            aEx.send({
              task: "execute",
              function: "validateEverything",
              argsArr: [
                ConfigManager.getSelectedServer(),
                DistroManager.isDevMode(),
              ],
            });
          }
        }
      );
    }
  );
}
