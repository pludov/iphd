# Mobindi

[![Build Status](https://travis-ci.org/pludov/mobindi.svg?branch=master)](https://travis-ci.org/pludov/mobindi)

## Introduction

Monitor and control an astrophotography session from a mobile phone !

This software is intended to be used for nomade astronomy, where size and power consumption matters.
It will typically run on a Raspberry PI or equivalent, using the Indi drivers, and phd2 for guiding.

It provides a fully responsive user interface to control and monitor various aspects of a astrophotograpy session.

Currently the following features are supported:
  * Interface to indi drivers (display connected, connect/disconnect devices, configure)
  * Take anb display single shot for Indi cameras (tested for Simulator on GPhoto)
  * Control and monitor PHD2 guiding :
    * connect devices to PHD2, start and stop PHD2 guiding
    * Display current RMS/Star Mass
    * show a graph of drift (RA/Dec)
  * Autostart phd2 and indiserver


The UI is designed to be fit a mobile screen and will adapt to the resolution (even below 640x480) and orientation (landscape vs portrait).

The recommended browsers are Firefox and Chrome.

Clickable area are big enough to keep the use easy.

Only events are sent between server to UI (unlike VNC which transfer bitmaps), so the UI will stay responsive even over relatively slow link.
(A wifi hotspot should works at 20/30 meters in a field)

The UI can also be displayed on a dedicated LCD display, using a browser in kiosk mode.

This software is still in early development stage; if it proves useful, lots of features will be added, to cover most aspects of a DSLR setup. (alignment, image sequences, astrometry, manual/auto focus, ...)

Remark: this is not a full solution for astronomy on raspberry pi. It is just a user interface over 
existing softwares. You can find full software stack for astro/PI in the following projects :
  * iAstroHub : https://github.com/aruangra/iAstroHub
  * NAFABox : http://www.webastro.net/forum/showthread.php?t=148388
  * ...

## What's new

### Next release
  * Metrics endpoint for monitoring using Prometheus.
  * Improved sequence editor allowing to iterate various values of a parameter (like filters ...)
  * Histogram inspection available from image viewer
  * Sequence usability improvment, including per image stats (fwhm, background adu level, ...)
  * Support for custom http port. This is usefull if mobindi needs to coexist with other tool running on port 8080. To use, set the PORT env variable in mobindi.conf:
```
PORT=8081
```
  * Inline help available for most actions, with easy access from mobile device:

![Inline Help](docs/inline_help.gif?raw=true "Inline help example")



### Release 1.2.0 (July 2019):
  * Push notifications: Push notifications deliver system notifications on mobile, even when screen is off. Tab must not be closed though.
    They require the use of a HTTPS connection and an authorization (accessible in the message tab)
  * Sequence status notification : Sequence success/error are notified to user, using in app or system notification
  * "Cover scope" messages are delivered in sequence when switching from/to dark/bias/flat. This is a per camera setting and can be (de)activated in Mobindi's advanced props for the Camera indi driver
  * Manual filter wheel support. Mobindi recognize the indi_manual_wheel and send notifications when required. You can also ask for filter confirmation for any other kinds of filter wheel (in mobindi's advanced props for driver. Mobindi will then ask confirmation before every filter change during sequences.)

![Manual filterwheel](docs/manual_filterwheel.gif?raw=true "Manual filterwheel")

  * Improved sequence editor with hierachical settings
  * PHD2 dithering settings can be controled per sequence
  * Live view for PHD. Mobindi can now display PHD frame stream (with adjustable levels), and allows to select the guide star.
    For this to work, you need to have a recent PHD version (> July 20 2019) and PHD must be configured to use an INDI camera.

![PHD live view](docs/phd_live.gif?raw=true "PHD live view/Star selection")

  * Control PHD exposure duration
  * Info/Warning messages from PHD are displayed as notification in Mobindi UI (messages like "Dark library does not match", ...)
  * Astrometry settings now persist accross restarts

**Upgrade notes**

This version now uses libindiclient, so you'll need to have libindi-dev package installed (in case you did not compile indilib from source)



### Release 1.1.0 (June 2019):
  * Filterwheel control in camera and sequence
  * Support for landscape orientation
  * Support for larger screen (tablet/desktop)
  * UI fixes for Chrome
  * Remember camera settings accros restarts
  * Auto focuser graph improvment
  * Preliminary support for ssl (on port 8443)
  * New script for build/startup (install.sh/startup.sh)

See below for installation/upgrade instruction.

### Initial Release: 1.0

## Features

### Camera handling

The camera tab allow settings, display images in a very fast online fits viewer that adapts content to the resolution of the display and the wifi bandwith. It of course supports zoom/pan using finger touch.

The levels are automatically optimized with auto dark/mid/white level according to histogram.

The camera app can also display FWHM and trigger astrometry sync and goto (center).

![The camera UI](docs/camera.png?raw=true "The camera UI")

### Photo sequencer

The sequence editor allows to program repeated shoots, possibily with various exposure and using dithering (with PHD2).

:fire: You can also create and re-order child steps that will inherit their settings from the parent (usefull for instance to iterate various filters).

:fire: Optionaly, Mobindi can inform you about the evolution of a sequence, either when things break or when manual intervention is required (ie for dark, manual filter wheels, ...)


![Sequence list UI](docs/sequence-view.png?raw=true "Sequence list UI")

Creating a sequence that iterates multiple filters but shares other settings:

![Sequence editor UI](docs/create_sequence_rgb.gif?raw=true "Sequence editor UI")


### Guiding using PHD2

The guiding tab displays current status of PHD2 as well as guiding statistics (pixels drifts). The settling periods are displayed in green. The graph can be zoomed for inspection.

It is possible to start/stop PHD2 from here, as long as it has a valid configuration.

If you use a INDI camera with PHD2, you can switch to "Live" view, to view the actual image stream processed by PHD. You can adjust levels, view PHD lock position and select guide star. For this to work, you need to have a recent PHD version (> July 20 2019) that is not using indi "stream".

![PHD2 UI](docs/phd2.png?raw=true "PHD2 UI")

![PHD live view](docs/phd_live.gif?raw=true "PHD live view/Star selection")

### Focusing

In the focus tab, you'll be able to control your focuser, scanning a range of steps to find the optimal value of FWHM.

![Focuser UI](docs/focuser.png?raw=true "Focuser UI")

### Astrometry

The astrometry tab displays settings used for plate solving.

Internally, the fantastic astrometry.net engine is used. Mobinding controls the search range passed to astrometry.net, in order to have super fast result on low hardware.

It is also possible to push your phone GPS coordinates to INDI configuration from here. (the green button on the screenshot indicates that they are already in sync).

![Astrometry settings](docs/astrometry-settings.png?raw=true "Astrometry settings")

### Polar alignment

With astrometry set up, Mobindi can help you align your mount.

It will scan an arc of the sky in right ascension, doing photo+astrometry at different locations, and deduce from that data the location of your polar axis. At least 3 points are required, but more can be used to improve accuracy !

The wizard displays DEC varations corresponding to RA move. A perfect alignement will lead to an horizontal graph (but pay attention to the scale of the vertical axis !)

You'll then be able to adjust your alignment and use the wizard to precisely measure the progress using astrometry.

![Polar Align UI](docs/polar-align.png?raw=true "Polar Align")

### Indi control panel

The indi control panel gives access to all properties of your indi drivers, with a UI dedicated to mobile phone. Almost everything that is not natively covered by Mobindi can be done from here.

You can as well restart stuck drivers here, configure auto restart/auto connect, but for now, it is not possible to add a new driver (this is done in a json config file : local/indi.json)

![Indi control panel UI](docs/indi-panel.png?raw=true "Indi control panel ")

### Indi messages

Notifications from indi driver are visible here. The number of unread messages is displayed when the tab is not selected so you know when something is happening.

![Indi message board](docs/indi-messages.png?raw=true "Indi message board")




## Quick start

Prior to using this software, you must have a working installation of Indi (server and drivers) and phd2 (so that clicking connect then guide actually starts guiding...).

The above instructions are valid for a debian based system (including raspbian for raspberry PI). I use them verbatim on Ubuntu 18.04 (x86/64) and Linaro (Asus Tinker board).

Some packages are required for building. Install them:
```
sudo apt-get install git cmake zlib1g-dev libcurl4-openssl-dev libgsl-dev libraw-dev libcfitsio-dev libjpeg-dev libpng-dev libcgicc-dev daemontools nginx
```

If you did not compile indi from source, you'll need indi dev packages as well:
```
sudo apt-get install libindi-dev
```

You also need nodejs installed, with a recent version (> v8). I use the latest (v12.18.2)
```
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install
```

Installation:
```
git clone https://github.com/pludov/mobindi.git
cd mobindi
./install.sh
```

Startup:
```
./startup.sh
```

Connect to https://localhost:8443. You will have to accept a self-signed certificate.


To upgrade to the latest version, issue:
```
git pull --ff-only
./install.sh
./startup.sh
```

## Start with boot

For system autostart, it is recommanded to first set a log directory:
```
./install.sh --log-dir /var/log/mobindi
```

Then depending on your distro, adding the following to /etc/rc.local should autostart (just adjust path and user)

```
su -l -c "/home/myuser/startup.sh" myuser &
```

## Starting phd2/indiserver

As an option, the server can start indiserver and phd2. For this to work, you must activate it in two configuration files : local/indi.json and local/phd2.json. (The configuration files are not created until the first run of the server)

Theses files are empty by default; when edited, the server must be restarted to take changes into account. Examples are provided (local/indi.default.json and local/phd2.default.json)

For indi, you must declare all devices that you intend to run in the json file (see the default for an example).

## Internals

There are three parts :
  * A HTTP server in nodejs communicates with PHD and Indi
  * A CGI for image preview (fitsviewer)
  * A react UI (served by the HTTP server) that render the app

Appart from images, communication between server and UI uses exclusively websocket.

## Developpment

For doing dev, a server dedicated to React UI can be used. This provides instant reloading on change (code, css, ...).
To use it, start the server, and the ui : cd ui && npm start
Then connect to port 3000 : http://localhost:3000

The REACT http server on port 3000 will automatically push changes to UI, and relay request to the backed to port 8080


## Licence

Copyright ©2017-2020 Ludovic Pollet &lt;<a mailto="pludow@gmail.com">pludow@gmail.com</a>&gt;. All rights reserved.

This software is provided under the GPL-3 licence.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License version 3 as published by
the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.

Astrometry icon made by smashicons from www.flaticon.com

