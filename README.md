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

## How to Run
Double-click `run.bat` or run:
```powershell
npm start
```
