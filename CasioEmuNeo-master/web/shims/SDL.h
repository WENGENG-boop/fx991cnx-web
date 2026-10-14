/*
 * Minimal SDL2 compatibility header for the WebAssembly build.
 *
 * Only the surface actually touched by the *core* emulator is provided here
 * (see web/README.md for the exact list). Everything is backed by a small
 * software rasteriser in sdl_soft.cpp, so no SDL2 port for Emscripten is
 * needed.
 */
#pragma once

#include <cstdint>
#include <cstring>

typedef uint8_t Uint8;
typedef int8_t Sint8;
typedef uint16_t Uint16;
typedef int16_t Sint16;
typedef uint32_t Uint32;
typedef int32_t Sint32;
typedef uint64_t Uint64;
typedef int64_t Sint64;

typedef int SDL_bool;
#define SDL_TRUE 1
#define SDL_FALSE 0

typedef Sint32 SDL_Keycode;
typedef Uint16 SDL_Keymod;
#define SDLK_UNKNOWN 0

/* --- window flags / hints ------------------------------------------------ */
#define SDL_WINDOWPOS_UNDEFINED 0x1FFF0000u
#define SDL_WINDOWPOS_CENTERED 0x2FFF0000u
#define SDL_WINDOW_FULLSCREEN 0x00000001u
#define SDL_WINDOW_SHOWN 0x00000004u
#define SDL_WINDOW_HIDDEN 0x00000008u
#define SDL_WINDOW_RESIZABLE 0x00000020u

#define SDL_HINT_RENDER_SCALE_QUALITY "SDL_RENDER_SCALE_QUALITY"

/* --- pixel formats / access --------------------------------------------- */
#define SDL_PIXELFORMAT_ABGR8888 0x16162007u
#define SDL_TEXTUREACCESS_STATIC 0
#define SDL_TEXTUREACCESS_STREAMING 1
#define SDL_TEXTUREACCESS_TARGET 2

/* --- blend modes --------------------------------------------------------- */
typedef enum
{
	SDL_BLENDMODE_NONE = 0x00000000,
	SDL_BLENDMODE_BLEND = 0x00000001,
	SDL_BLENDMODE_ADD = 0x00000002,
	SDL_BLENDMODE_MOD = 0x00000004,
	SDL_BLENDMODE_MUL = 0x00000008,
	SDL_BLENDMODE_INVALID = 0x7FFFFFFF
} SDL_BlendMode;

/* --- events -------------------------------------------------------------- */
enum
{
	SDL_FIRSTEVENT = 0,
	SDL_QUIT = 0x100,
	SDL_APP_TERMINATING = 0x101,
	SDL_WINDOWEVENT = 0x200,
	SDL_KEYDOWN = 0x300,
	SDL_KEYUP = 0x301,
	SDL_TEXTINPUT = 0x303,
	SDL_MOUSEMOTION = 0x400,
	SDL_MOUSEBUTTONDOWN = 0x401,
	SDL_MOUSEBUTTONUP = 0x402,
	SDL_MOUSEWHEEL = 0x403,
	SDL_USEREVENT = 0x8000,
	SDL_LASTEVENT = 0xFFFF
};

enum
{
	SDL_WINDOWEVENT_NONE = 0,
	SDL_WINDOWEVENT_SHOWN = 1,
	SDL_WINDOWEVENT_HIDDEN = 2,
	SDL_WINDOWEVENT_EXPOSED = 3,
	SDL_WINDOWEVENT_MOVED = 4,
	SDL_WINDOWEVENT_RESIZED = 5,
	SDL_WINDOWEVENT_SIZE_CHANGED = 6,
	SDL_WINDOWEVENT_MINIMIZED = 7,
	SDL_WINDOWEVENT_MAXIMIZED = 8,
	SDL_WINDOWEVENT_RESTORED = 9,
	SDL_WINDOWEVENT_CLOSE = 14
};

#define SDL_PRESSED 1
#define SDL_RELEASED 0

#define SDL_BUTTON_LEFT 1
#define SDL_BUTTON_MIDDLE 2
#define SDL_BUTTON_RIGHT 3

typedef struct SDL_Keysym
{
	Sint32 scancode;
	SDL_Keycode sym;
	Uint16 mod;
	Uint32 unused;
} SDL_Keysym;

typedef struct SDL_KeyboardEvent
{
	Uint32 type;
	Uint32 timestamp;
	Uint32 windowID;
	Uint8 state;
	Uint8 repeat;
	Uint8 padding2;
	Uint8 padding3;
	SDL_Keysym keysym;
} SDL_KeyboardEvent;

typedef struct SDL_MouseMotionEvent
{
	Uint32 type;
	Uint32 timestamp;
	Uint32 windowID;
	Uint32 which;
	Uint32 state;
	Sint32 x;
	Sint32 y;
	Sint32 xrel;
	Sint32 yrel;
} SDL_MouseMotionEvent;

typedef struct SDL_MouseButtonEvent
{
	Uint32 type;
	Uint32 timestamp;
	Uint32 windowID;
	Uint32 which;
	Uint8 button;
	Uint8 state;
	Uint8 clicks;
	Uint8 padding1;
	Sint32 x;
	Sint32 y;
} SDL_MouseButtonEvent;

typedef struct SDL_MouseWheelEvent
{
	Uint32 type;
	Uint32 timestamp;
	Uint32 windowID;
	Uint32 which;
	Sint32 x;
	Sint32 y;
	Uint32 direction;
	float preciseX;
	float preciseY;
} SDL_MouseWheelEvent;

typedef struct SDL_UserEvent
{
	Uint32 type;
	Uint32 timestamp;
	Uint32 windowID;
	Sint32 code;
	void *data1;
	void *data2;
} SDL_UserEvent;

typedef struct SDL_WindowEvent
{
	Uint32 type;
	Uint32 timestamp;
	Uint32 windowID;
	Uint8 event;
	Uint8 padding1;
	Uint8 padding2;
	Uint8 padding3;
	Sint32 data1;
	Sint32 data2;
} SDL_WindowEvent;

typedef union SDL_Event
{
	Uint32 type;
	SDL_KeyboardEvent key;
	SDL_MouseMotionEvent motion;
	SDL_MouseButtonEvent button;
	SDL_MouseWheelEvent wheel;
	SDL_UserEvent user;
	SDL_WindowEvent window;
	Uint8 padding[56];
} SDL_Event;

#define SDL_zero(x) std::memset(&(x), 0, sizeof(x))

/* --- opaque handles ------------------------------------------------------ */
typedef struct SDL_Window SDL_Window;
typedef struct SDL_Renderer SDL_Renderer;
typedef struct SDL_Texture SDL_Texture;
typedef struct SDL_Cursor SDL_Cursor;

typedef struct SDL_Rect
{
	int x, y;
	int w, h;
} SDL_Rect;

typedef struct SDL_Color
{
	Uint8 r, g, b, a;
} SDL_Color;

typedef struct SDL_Palette SDL_Palette;

typedef struct SDL_PixelFormat
{
	Uint32 format;
	SDL_Palette *palette;
	Uint8 BitsPerPixel;
	Uint8 BytesPerPixel;
	Uint8 padding[2];
	Uint32 Rmask, Gmask, Bmask, Amask;
	Uint8 Rloss, Gloss, Bloss, Aloss;
	Uint8 Rshift, Gshift, Bshift, Ashift;
	int refcount;
	struct SDL_PixelFormat *next;
} SDL_PixelFormat;

typedef struct SDL_Surface
{
	Uint32 flags;
	SDL_PixelFormat *format;
	int w, h;
	int pitch;
	void *pixels;
	void *userdata;
	int locked;
	void *list_blitmap;
	SDL_Rect clip_rect;
	struct SDL_BlitMap *map;
	int refcount;
} SDL_Surface;

/* --- lifecycle ----------------------------------------------------------- */
#define SDL_INIT_TIMER 0x00000001u
#define SDL_INIT_VIDEO 0x00000020u

int SDL_Init(Uint32 flags);
void SDL_Quit(void);
const char *SDL_GetError(void);
SDL_bool SDL_SetHint(const char *name, const char *value);
Uint32 SDL_GetTicks(void);

/* --- window / renderer --------------------------------------------------- */
SDL_Window *SDL_CreateWindow(const char *title, int x, int y, int w, int h, Uint32 flags);
void SDL_DestroyWindow(SDL_Window *window);
SDL_Renderer *SDL_CreateRenderer(SDL_Window *window, int index, Uint32 flags);
void SDL_DestroyRenderer(SDL_Renderer *renderer);
void SDL_SetRenderTarget(SDL_Renderer *renderer, SDL_Texture *texture);
void SDL_SetRenderDrawColor(SDL_Renderer *renderer, Uint8 r, Uint8 g, Uint8 b, Uint8 a);
void SDL_SetRenderDrawBlendMode(SDL_Renderer *renderer, SDL_BlendMode blendMode);
int SDL_RenderClear(SDL_Renderer *renderer);
int SDL_RenderFillRect(SDL_Renderer *renderer, const SDL_Rect *rect);
int SDL_RenderPresent(SDL_Renderer *renderer);

/* --- textures ------------------------------------------------------------ */
SDL_Texture *SDL_CreateTexture(SDL_Renderer *renderer, Uint32 format, int access, int w, int h);
SDL_Texture *SDL_CreateTextureFromSurface(SDL_Renderer *renderer, SDL_Surface *surface);
void SDL_DestroyTexture(SDL_Texture *texture);
int SDL_QueryTexture(SDL_Texture *texture, Uint32 *format, int *access, int *w, int *h);
int SDL_SetTextureColorMod(SDL_Texture *texture, Uint8 r, Uint8 g, Uint8 b);
int SDL_SetTextureAlphaMod(SDL_Texture *texture, Uint8 alpha);
int SDL_SetTextureBlendMode(SDL_Texture *texture, SDL_BlendMode blendMode);
int SDL_UpdateTexture(SDL_Texture *texture, const SDL_Rect *rect, const void *pixels, int pitch);
int SDL_RenderCopy(SDL_Renderer *renderer, SDL_Texture *texture, const SDL_Rect *srcrect, const SDL_Rect *dstrect);
int SDL_RenderCopyEx(SDL_Renderer *renderer, SDL_Texture *texture, const SDL_Rect *srcrect, const SDL_Rect *dstrect, double angle, const void *center, int flip);

/* --- surfaces ------------------------------------------------------------ */
void SDL_FreeSurface(SDL_Surface *surface);

/* --- events / input ------------------------------------------------------ */
int SDL_PushEvent(SDL_Event *event);
int SDL_PollEvent(SDL_Event *event);
SDL_Keycode SDL_GetKeyFromName(const char *name);
const char *SDL_GetKeyName(SDL_Keycode key);
int SDL_ShowCursor(int toggle);
SDL_Cursor *SDL_CreateSystemCursor(int id);
void SDL_FreeCursor(SDL_Cursor *cursor);
int SDL_SetCursor(SDL_Cursor *cursor);

/* --- internals used by web_api.cpp --------------------------------------- */
namespace sdl_soft
{
	/* Physical size of the renderer's back buffer (the exposed framebuffer). */
	int BackbufferWidth();
	int BackbufferHeight();
	const Uint8 *BackbufferRGBA();

	/* Replace the interface (sprite atlas) texture pixels in place. */
	int UpdateInterfaceTexture(const Uint8 *rgba, int w, int h);

	/* Stage the interface image before the Emulator constructs its own texture. */
	void StageInterfaceImage(const Uint8 *rgba, int w, int h);

	/* Forget every renderer/window/texture created so far. */
	void Shutdown();
}
