# Buaic-Workout-Tracker
Offline-first React Native &amp; Expo workout tracker featuring native background alarms, local SQLite persistence, and visual anatomical coverage tracking.

# Core Problem
The reason I built this app is because many available options are all paid or require an internet connection to use, which notoriously most gyms have terrible internet connection.
Previously I was simply using my notes app to track my workout and I eventually grew sick of having to type out every movement and every set, then set a timer after every set, so I built an app that does it all for me.

# Archtiecture
The app utilizes SQLite over other options because it is an efficient database structure, which is stored locally on device making it not reliant on a constant connection.

# Technical challenges
During testing I was really struggling with getting the rest timer to work consistently, sometimes notifications would be triggered for the wrong reason, the timer would be too slow, too fast, wouldn't work when app was not in focus, and sometimes would not send notifications at all
I learned most of these issues were all caused by android Doze mode, which is a system in android that aggressively targets background processes which I was able to work around by using epoch timestamps and hardware timers.

# Tech Stack
React Native, Expo, SQLite, Javascript
