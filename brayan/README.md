# Brayan vs The Gunman

The next fight, for Brayan (a paraprofessional), in a school hallway after hours. So far there's
a still of it, `mockup.html`: the hallway with every light off but one at the far end, the gunman
standing in it (on the floor, in front of that light, his shadow and reflection down the polished
floor), and the HUD: Crispy's, laid out the same way, gone to school (a ruler for the top strip,
his box a staff ID badge, the log a notebook page, a pencil for the cursor, PERIOD for ROUND,
PATIENCE for SP).

The photo of the hallway and Brayan's portrait aren't in the repo, nor is anything made from
them. Put `hallway.webp` and `brayan_portrait.png` in `brayan/assets/source/`, then:

    python3 brayan/tools/make_images.py   # writes brayan/js/images.js
    open brayan/mockup.html

The school's name and logo are taken off the doors at the end of the hall, and the chair in the
corner of the photo is cropped away.
