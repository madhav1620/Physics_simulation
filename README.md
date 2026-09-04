# Kinematics & Projectile Motion - Desktop Software

A standalone, real-time 2D & 1D physics simulation desktop software built with Electron and HTML5 Canvas.

## Features
- **2D Projectile Motion & 1D Free Fall Modes**
- **Real-Time Interactive Physics Canvas**:
  - Live trajectory trails and particle animations
  - Rotatable cannon launcher with height pedestal
  - Instantaneous velocity and acceleration vector arrows
  - Ground collision detection with impact shockwave rings
- **Live Parameter Controls**:
  - Initial Velocity ($v_0$), Launch Angle ($\theta$), Initial Height ($h_0$)
  - Gravitational environments with quick presets (Earth, Moon, Mars, Jupiter) or custom sliders
  - Air resistance drag coefficient ($k$)
  - Ideal theoretical vacuum arc overlay
- **Telemetry & Energy Analytics**:
  - Real-time Height, Range, Flight Time, and Velocity readouts
  - Live Mechanical Energy breakdown bar ($KE$ vs $PE$)
  - Dynamic trajectory plot ($y$ vs $x$)
  - Export trajectory simulation data to CSV

## Requirements
- [Node.js](https://nodejs.org/) 18 or newer (npm is included with Node.js)
- Windows, macOS, or Linux for development

## Installation
Clone or download this repository, open a terminal in the project folder, and install the required modules:

```powershell
npm install
```

This downloads Electron and Electron Packager automatically from the dependencies listed in `package.json`. You do not need to upload or manually copy the `node_modules` folder.

## How to Run
After installation, double-click `run.bat` on Windows or run:
```powershell
npm start
```

To create a Windows packaged application, run:

```powershell
npm run package-win
```
