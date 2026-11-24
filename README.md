# Kalim Social

A responsive social-network starter built with HTML, CSS, JavaScript and Supabase.

## Files
- `index.html` — page structure
- `style.css` — responsive styling
- `app.js` — Supabase authentication and social features

## Setup
1. Open `app.js`.
2. Keep the Supabase project URL and replace `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE` with your project's **publishable/anon key**.
3. Never use a Supabase `secret` or `service_role` key in browser JavaScript.
4. Confirm the database tables and policies exist: `profiles`, `posts`, `likes`, `comments`, `follows`, `notifications`.
5. Confirm the public Storage bucket `social-images` exists and has upload policies for authenticated users.
6. Upload all three files to your GitHub repository root and enable GitHub Pages.

## Expected columns
- `profiles`: `id`, `full_name`, `username`, `bio`, `avatar_url`
- `posts`: `id`, `user_id`, `content`, `image_url`, `created_at`
- `likes`: `post_id`, `user_id`
- `comments`: `id`, `post_id`, `user_id`, `content`, `created_at`
- `follows`: `follower_id`, `following_id`
- `notifications`: `id`, `user_id`, `actor_id`, `type`, `post_id`, `is_read`, `created_at`

This is a starter release, not a complete production social network. Before opening it to the public, review RLS policies, abuse reporting/moderation, privacy, rate limits, image validation and account recovery.
