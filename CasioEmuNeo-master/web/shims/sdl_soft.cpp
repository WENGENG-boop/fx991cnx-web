/*
 * Software rasteriser backing the SDL2 shim.
 *
 * Everything is composited into plain RGBA buffers; there is no GL, no
 * threading and no real window. The renderer's default target *is* the
 * framebuffer exposed to JavaScript through emu_web_fb().
 */
#include "SDL.h"
#include "SDL_image.h"

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

/* --- data types ---------------------------------------------------------- */

struct SDL_Window
{
	int w = 0, h = 0;
	std::string title;
};

struct SDL_Cursor
{
	int id = 0;
};

struct SDL_Texture
{
	int w = 0, h = 0;
	bool is_target = false;
	std::vector<Uint32> px;
	Uint8 cr = 255, cg = 255, cb = 255, ca = 255;
	int blend = SDL_BLENDMODE_BLEND;
};

struct SDL_Renderer
{
	SDL_Window *window = nullptr;
	std::vector<Uint32> backbuffer;
	SDL_Texture *target = nullptr;
	Uint8 dr = 0, dg = 0, db = 0, da = 255;
	int draw_blend = SDL_BLENDMODE_NONE;
};

/* --- locals -------------------------------------------------------------- */

namespace
{
	inline Uint32 PackRGBA(Uint8 r, Uint8 g, Uint8 b, Uint8 a)
	{
		return (Uint32)r | ((Uint32)g << 8) | ((Uint32)b << 16) | ((Uint32)a << 24);
	}
	inline Uint8 PxR(Uint32 p) { return (Uint8)(p & 0xFF); }
	inline Uint8 PxG(Uint32 p) { return (Uint8)((p >> 8) & 0xFF); }
	inline Uint8 PxB(Uint32 p) { return (Uint8)((p >> 16) & 0xFF); }
	inline Uint8 PxA(Uint32 p) { return (Uint8)((p >> 24) & 0xFF); }

	struct TargetView
	{
		Uint32 *px;
		int w, h;
	};

	SDL_Window *g_window = nullptr;
	SDL_Renderer *g_renderer = nullptr;
	SDL_Texture *g_interface_texture = nullptr;
	Uint32 g_ticks_ms = 0;

	std::vector<SDL_Texture *> g_texture_pool;
	std::vector<SDL_Texture *> g_textures_live;

	std::vector<Uint8> g_staged_rgba;
	int g_staged_w = 0, g_staged_h = 0;

	char g_error[256] = "no error";

	void SetError(const char *msg)
	{
		std::snprintf(g_error, sizeof(g_error), "%s", msg);
	}

	TargetView GetTargetView(SDL_Renderer *renderer)
	{
		if (renderer->target)
			return {renderer->target->px.data(), renderer->target->w, renderer->target->h};
		if (!renderer->window)
			return {nullptr, 0, 0};
		return {renderer->backbuffer.data(), renderer->window->w, renderer->window->h};
	}

	SDL_Texture *AcquireTexture(int w, int h, bool is_target)
	{
		for (size_t ix = 0; ix != g_texture_pool.size(); ++ix)
		{
			SDL_Texture *candidate = g_texture_pool[ix];
			if (candidate->w == w && candidate->h == h && candidate->is_target == is_target)
			{
				g_texture_pool.erase(g_texture_pool.begin() + ix);
				g_textures_live.push_back(candidate);
				return candidate;
			}
		}

		SDL_Texture *texture = new SDL_Texture;
		texture->w = w;
		texture->h = h;
		texture->is_target = is_target;
		texture->px.assign((size_t)w * h, PackRGBA(0, 0, 0, 255));
		g_textures_live.push_back(texture);
		return texture;
	}

	SDL_PixelFormat *NewFormat()
	{
		SDL_PixelFormat *format = new SDL_PixelFormat;
		std::memset(format, 0, sizeof(SDL_PixelFormat));
		format->format = SDL_PIXELFORMAT_ABGR8888;
		format->BitsPerPixel = 32;
		format->BytesPerPixel = 4;
		format->Rmask = 0x000000FF;
		format->Gmask = 0x0000FF00;
		format->Bmask = 0x00FF0000;
		format->Amask = 0xFF000000;
		format->Rshift = 0;
		format->Gshift = 8;
		format->Bshift = 16;
		format->Ashift = 24;
		format->refcount = 1;
		return format;
	}

	const char *const kKeyNames[] = {
		"backspace", "tab", "return", "escape", "space",
		"left", "right", "up", "down", "home", "end",
		"pageup", "pagedown", "insert", "delete", "capslock",
		"leftshift", "rightshift", "leftctrl", "rightctrl", "leftalt", "rightalt",
		"f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
		"keypad0", "keypad1", "keypad2", "keypad3", "keypad4", "keypad5",
		"keypad6", "keypad7", "keypad8", "keypad9", "keypad.", "keypad/",
		"keypad*", "keypad-", "keypad+", "keypadenter", "keypad=",
	};

	const SDL_Keycode kKeyCodes[] = {
		'\b', '\t', '\r', 0x1B, ' ',
		0x40000050, 0x4000004F, 0x40000052, 0x40000051, 0x4000004A, 0x4000004D,
		0x4000004B, 0x4000004E, 0x40000049, 0x4000004C, 0x40000039,
		0x400000E1, 0x400000E5, 0x400000E0, 0x400000E4, 0x400000E2, 0x400000E6,
		0x4000003A, 0x4000003B, 0x4000003C, 0x4000003D, 0x4000003E, 0x4000003F,
		0x40000040, 0x40000041, 0x40000042, 0x40000043, 0x40000044, 0x40000045,
		0x40000062, 0x40000059, 0x4000005A, 0x4000005B, 0x4000005C, 0x4000005D,
		0x4000005E, 0x4000005F, 0x40000060, 0x40000061, 0x40000063, 0x40000054,
		0x40000055, 0x40000056, 0x40000057, 0x40000058, 0x40000067,
	};

	/* Lower-cases and drops spaces/underscores so that "Page Down", "pagedown"
	 * and "kP 1" all land on the same entry.  Hyphens are deliberately kept:
	 * SDL spells the keypad minus key "Keypad -", and dropping the hyphen would
	 * leave the bare word "keypad", which is not a key at all. */
	std::string Normalise(const char *name)
	{
		std::string result;
		for (const char *p = name; *p; ++p)
		{
			char ch = *p;
			if (ch == ' ' || ch == '_')
				continue;
			if (ch >= 'A' && ch <= 'Z')
				ch = (char)(ch - 'A' + 'a');
			result.push_back(ch);
		}
		return result;
	}

	std::string KeyNameOf(SDL_Keycode key)
	{
		for (size_t ix = 0; ix != sizeof(kKeyNames) / sizeof(kKeyNames[0]); ++ix)
			if (kKeyCodes[ix] == key)
			{
				std::string name = kKeyNames[ix];
				for (size_t jx = 0; jx != name.size(); ++jx)
					if (name[jx] >= 'a' && name[jx] <= 'z')
						name[jx] = (char)(name[jx] - 'a' + 'A');
				return name;
			}
		char buffer[2] = {(char)(key & 0x7F), 0};
		return buffer;
	}
}

/* --- lifecycle ----------------------------------------------------------- */

int SDL_Init(Uint32)
{
	return 0;
}

void SDL_Quit(void)
{
}

const char *SDL_GetError(void)
{
	return g_error;
}

SDL_bool SDL_SetHint(const char *, const char *)
{
	return SDL_TRUE;
}

Uint32 SDL_GetTicks(void)
{
	return g_ticks_ms;
}

/* --- window / renderer --------------------------------------------------- */

SDL_Window *SDL_CreateWindow(const char *title, int, int, int w, int h, Uint32)
{
	if (g_window)
		return g_window;

	SDL_Window *window = new SDL_Window;
	window->w = w;
	window->h = h;
	window->title = title ? title : "";
	g_window = window;
	return window;
}

void SDL_DestroyWindow(SDL_Window *window)
{
	if (window == g_window)
		g_window = nullptr;
	delete window;
}

SDL_Renderer *SDL_CreateRenderer(SDL_Window *window, int, Uint32)
{
	if (g_renderer)
		return g_renderer;

	SDL_Renderer *renderer = new SDL_Renderer;
	renderer->window = window;
	renderer->backbuffer.assign((size_t)window->w * window->h, PackRGBA(0, 0, 0, 255));
	g_renderer = renderer;
	return renderer;
}

void SDL_DestroyRenderer(SDL_Renderer *renderer)
{
	if (renderer == g_renderer)
		g_renderer = nullptr;
	delete renderer;
}

void SDL_SetRenderTarget(SDL_Renderer *renderer, SDL_Texture *texture)
{
	if (renderer)
		renderer->target = texture;
}

void SDL_SetRenderDrawColor(SDL_Renderer *renderer, Uint8 r, Uint8 g, Uint8 b, Uint8 a)
{
	if (!renderer)
		return;
	renderer->dr = r;
	renderer->dg = g;
	renderer->db = b;
	renderer->da = a;
}

void SDL_SetRenderDrawBlendMode(SDL_Renderer *renderer, SDL_BlendMode blendMode)
{
	if (renderer)
		renderer->draw_blend = blendMode;
}

int SDL_RenderClear(SDL_Renderer *renderer)
{
	if (!renderer)
		return -1;
	TargetView view = GetTargetView(renderer);
	if (!view.px)
		return -1;

	Uint32 colour = PackRGBA(renderer->dr, renderer->dg, renderer->db, renderer->da);
	std::fill(view.px, view.px + (size_t)view.w * view.h, colour);
	return 0;
}

int SDL_RenderFillRect(SDL_Renderer *renderer, const SDL_Rect *rect)
{
	if (!renderer)
		return -1;
	TargetView view = GetTargetView(renderer);
	if (!view.px)
		return -1;

	SDL_Rect area = rect ? *rect : SDL_Rect{0, 0, view.w, view.h};
	int x0 = area.x, y0 = area.y;
	int x1 = area.x + area.w, y1 = area.y + area.h;
	if (x0 < 0) x0 = 0;
	if (y0 < 0) y0 = 0;
	if (x1 > view.w) x1 = view.w;
	if (y1 > view.h) y1 = view.h;
	if (x0 >= x1 || y0 >= y1)
		return 0;

	const Uint32 a = renderer->da;
	Uint32 colour = PackRGBA(renderer->dr, renderer->dg, renderer->db, renderer->da);
	const bool blend = renderer->draw_blend == SDL_BLENDMODE_BLEND;

	for (int y = y0; y != y1; ++y)
	{
		Uint32 *row = view.px + (size_t)y * view.w;
		if (!blend || a == 255)
		{
			std::fill(row + x0, row + x1, colour);
			continue;
		}
		if (a == 0)
			continue;
		for (int x = x0; x != x1; ++x)
		{
			Uint32 dst = row[x];
			Uint8 nr = (Uint8)((renderer->dr * a + (Uint32)PxR(dst) * (255 - a)) / 255);
			Uint8 ng = (Uint8)((renderer->dg * a + (Uint32)PxG(dst) * (255 - a)) / 255);
			Uint8 nb = (Uint8)((renderer->db * a + (Uint32)PxB(dst) * (255 - a)) / 255);
			Uint8 na = (Uint8)(a + (Uint32)PxA(dst) * (255 - a) / 255);
			row[x] = PackRGBA(nr, ng, nb, na);
		}
	}
	return 0;
}

int SDL_RenderPresent(SDL_Renderer *renderer)
{
	if (!renderer)
		return -1;
	g_ticks_ms += 16;
	return 0;
}

/* --- textures ------------------------------------------------------------ */

SDL_Texture *SDL_CreateTexture(SDL_Renderer *renderer, Uint32, int access, int w, int h)
{
	if (!renderer || w <= 0 || h <= 0)
	{
		SetError("SDL_CreateTexture: invalid size");
		return nullptr;
	}
	return AcquireTexture(w, h, access == SDL_TEXTUREACCESS_TARGET);
}

SDL_Texture *SDL_CreateTextureFromSurface(SDL_Renderer *renderer, SDL_Surface *surface)
{
	if (!renderer || !surface || surface->w <= 0 || surface->h <= 0)
	{
		SetError("SDL_CreateTextureFromSurface: invalid surface");
		return nullptr;
	}

	SDL_Texture *texture = AcquireTexture(surface->w, surface->h, false);
	std::memcpy(texture->px.data(), surface->pixels, (size_t)surface->w * surface->h * 4);
	g_interface_texture = texture;
	return texture;
}

void SDL_DestroyTexture(SDL_Texture *texture)
{
	if (!texture)
		return;
	if (texture == g_interface_texture)
		g_interface_texture = nullptr;

	for (size_t ix = 0; ix != g_textures_live.size(); ++ix)
		if (g_textures_live[ix] == texture)
		{
			g_textures_live.erase(g_textures_live.begin() + ix);
			break;
		}
	g_texture_pool.push_back(texture);
}

int SDL_QueryTexture(SDL_Texture *texture, Uint32 *format, int *access, int *w, int *h)
{
	if (!texture)
		return -1;
	if (format) *format = SDL_PIXELFORMAT_ABGR8888;
	if (access) *access = texture->is_target ? SDL_TEXTUREACCESS_TARGET : SDL_TEXTUREACCESS_STATIC;
	if (w) *w = texture->w;
	if (h) *h = texture->h;
	return 0;
}

int SDL_SetTextureColorMod(SDL_Texture *texture, Uint8 r, Uint8 g, Uint8 b)
{
	if (!texture)
		return -1;
	texture->cr = r;
	texture->cg = g;
	texture->cb = b;
	return 0;
}

int SDL_SetTextureAlphaMod(SDL_Texture *texture, Uint8 alpha)
{
	if (!texture)
		return -1;
	texture->ca = alpha;
	return 0;
}

int SDL_SetTextureBlendMode(SDL_Texture *texture, SDL_BlendMode blendMode)
{
	if (!texture)
		return -1;
	texture->blend = blendMode;
	return 0;
}

int SDL_UpdateTexture(SDL_Texture *texture, const SDL_Rect *rect, const void *pixels, int pitch)
{
	if (!texture || !pixels)
		return -1;

	const Uint8 *source = (const Uint8 *)pixels;
	if (!rect)
	{
		std::memcpy(texture->px.data(), source, (size_t)texture->w * texture->h * 4);
		return 0;
	}

	for (int y = 0; y != rect->h; ++y)
	{
		int ty = rect->y + y;
		if (ty < 0 || ty >= texture->h)
			continue;
		for (int x = 0; x != rect->w; ++x)
		{
			int tx = rect->x + x;
			if (tx < 0 || tx >= texture->w)
				continue;
			const Uint8 *p = source + (size_t)y * pitch + (size_t)x * 4;
			texture->px[(size_t)ty * texture->w + tx] = PackRGBA(p[0], p[1], p[2], p[3]);
		}
	}
	return 0;
}

int SDL_RenderCopy(SDL_Renderer *renderer, SDL_Texture *texture, const SDL_Rect *srcrect, const SDL_Rect *dstrect)
{
	if (!renderer || !texture)
		return -1;
	TargetView view = GetTargetView(renderer);
	if (!view.px)
		return -1;

	SDL_Rect src = srcrect ? *srcrect : SDL_Rect{0, 0, texture->w, texture->h};
	if (src.x < 0) { src.w += src.x; src.x = 0; }
	if (src.y < 0) { src.h += src.y; src.y = 0; }
	if (src.x + src.w > texture->w) src.w = texture->w - src.x;
	if (src.y + src.h > texture->h) src.h = texture->h - src.y;
	if (src.w <= 0 || src.h <= 0)
		return 0;

	SDL_Rect dst = dstrect ? *dstrect : SDL_Rect{0, 0, view.w, view.h};
	if (dst.w <= 0 || dst.h <= 0)
		return 0;

	int x0 = dst.x, y0 = dst.y;
	int x1 = dst.x + dst.w, y1 = dst.y + dst.h;
	if (x0 < 0) x0 = 0;
	if (y0 < 0) y0 = 0;
	if (x1 > view.w) x1 = view.w;
	if (y1 > view.h) y1 = view.h;
	if (x0 >= x1 || y0 >= y1)
		return 0;

	const double scale_x = (double)src.w / dst.w;
	const double scale_y = (double)src.h / dst.h;

	const bool blend = texture->blend == SDL_BLENDMODE_BLEND;
	const Uint32 cmr = texture->cr, cmg = texture->cg, cmb = texture->cb, cma = texture->ca;
	const Uint32 *src_px = texture->px.data();
	const int src_w = texture->w, src_h = texture->h;

	for (int y = y0; y != y1; ++y)
	{
		int sy = src.y + (int)((y - dst.y) * scale_y);
		if (sy < 0) sy = 0;
		if (sy >= src_h) sy = src_h - 1;
		const Uint32 *src_row = src_px + (size_t)sy * src_w;
		Uint32 *dst_row = view.px + (size_t)y * view.w;

		for (int x = x0; x != x1; ++x)
		{
			int sx = src.x + (int)((x - dst.x) * scale_x);
			if (sx < 0) sx = 0;
			if (sx >= src_w) sx = src_w - 1;

			Uint32 sample = src_row[sx];
			if (!blend)
			{
				dst_row[x] = sample;
				continue;
			}

			Uint32 alpha = (Uint32)PxA(sample) * cma / 255;
			if (alpha == 0)
				continue;

			Uint32 red = (Uint32)PxR(sample) * cmr / 255;
			Uint32 green = (Uint32)PxG(sample) * cmg / 255;
			Uint32 blue = (Uint32)PxB(sample) * cmb / 255;

			if (alpha == 255)
			{
				dst_row[x] = PackRGBA((Uint8)red, (Uint8)green, (Uint8)blue, 255);
				continue;
			}

			Uint32 dst = dst_row[x];
			Uint32 inverse = 255 - alpha;
			Uint8 nr = (Uint8)((red * alpha + (Uint32)PxR(dst) * inverse) / 255);
			Uint8 ng = (Uint8)((green * alpha + (Uint32)PxG(dst) * inverse) / 255);
			Uint8 nb = (Uint8)((blue * alpha + (Uint32)PxB(dst) * inverse) / 255);
			Uint8 na = (Uint8)(alpha + (Uint32)PxA(dst) * inverse / 255);
			dst_row[x] = PackRGBA(nr, ng, nb, na);
		}
	}
	return 0;
}

int SDL_RenderCopyEx(SDL_Renderer *renderer, SDL_Texture *texture, const SDL_Rect *srcrect, const SDL_Rect *dstrect, double, const void *, int)
{
	return SDL_RenderCopy(renderer, texture, srcrect, dstrect);
}

/* --- surfaces ------------------------------------------------------------ */

void SDL_FreeSurface(SDL_Surface *surface)
{
	if (!surface)
		return;
	delete surface->format;
	delete[] (Uint8 *)surface->pixels;
	delete surface;
}

/* --- events / input ------------------------------------------------------ */

int SDL_PushEvent(SDL_Event *)
{
	return 1;
}

int SDL_PollEvent(SDL_Event *)
{
	return 0;
}

SDL_Keycode SDL_GetKeyFromName(const char *name)
{
	if (!name || !name[0])
		return 0;

	if (name[0] && !name[1])
		return (SDL_Keycode)(unsigned char)name[0];

	std::string key = Normalise(name);
	if (key == "enter")
		key = "return";
	if (key == "esc")
		key = "escape";
	if (key == "keypadenter" || key == "kpenter" || key == "numpadenter")
		return 0x40000058;
	if (key.compare(0, 2, "kp") == 0 && key.size() > 2 && key[2] >= '0' && key[2] <= '9' && key.size() == 3)
		key = "keypad" + key.substr(2);
	if (key.compare(0, 6, "keypad") == 0)
		key = "keypad" + key.substr(6);
	if (key.compare(0, 6, "numpad") == 0)
		key = "keypad" + key.substr(6);
	if (key == "pagedn")
		key = "pagedown";
	if (key == "pageup" || key == "pagedown" || key == "capslock")
		return key == "pageup" ? 0x4000004B : key == "pagedown" ? 0x4000004E : 0x40000039;
	if (key == "lshift" || key == "leftshift")
		return 0x400000E1;
	if (key == "rshift" || key == "rightshift")
		return 0x400000E5;

	for (size_t ix = 0; ix != sizeof(kKeyNames) / sizeof(kKeyNames[0]); ++ix)
		if (key == kKeyNames[ix])
			return kKeyCodes[ix];

	return 0;
}

const char *SDL_GetKeyName(SDL_Keycode key)
{
	static std::string buffer;
	buffer = KeyNameOf(key);
	return buffer.c_str();
}

int SDL_ShowCursor(int)
{
	return 0;
}

SDL_Cursor *SDL_CreateSystemCursor(int id)
{
	SDL_Cursor *cursor = new SDL_Cursor;
	cursor->id = id;
	return cursor;
}

void SDL_FreeCursor(SDL_Cursor *cursor)
{
	delete cursor;
}

int SDL_SetCursor(SDL_Cursor *)
{
	return 0;
}

/* --- SDL_image ----------------------------------------------------------- */

int IMG_Init(int)
{
	return IMG_INIT_PNG;
}

void IMG_Quit(void)
{
}

const char *IMG_GetError(void)
{
	return g_error;
}

SDL_Surface *IMG_Load(const char *file)
{
	if (!sdl_soft::HasStagedInterfaceImage())
	{
		SetError("IMG_Load: no interface image was staged; call emu_web_set_interface_image() first");
		std::fprintf(stderr, "[sdl_soft] IMG_Load(\"%s\") failed: %s\n", file ? file : "(null)", g_error);
		return nullptr;
	}

	SDL_Surface *surface = new SDL_Surface;
	std::memset(surface, 0, sizeof(SDL_Surface));
	surface->format = NewFormat();
	surface->w = sdl_soft::StagedInterfaceWidth();
	surface->h = sdl_soft::StagedInterfaceHeight();
	surface->pitch = surface->w * 4;
	surface->pixels = new Uint8[(size_t)surface->w * surface->h * 4];
	std::memcpy(surface->pixels, sdl_soft::StagedInterfacePixels(), (size_t)surface->w * surface->h * 4);
	surface->refcount = 1;
	return surface;
}

/* --- internals used by web_api.cpp --------------------------------------- */

namespace sdl_soft
{
	int BackbufferWidth()
	{
		return g_renderer && g_renderer->window ? g_renderer->window->w : 0;
	}

	int BackbufferHeight()
	{
		return g_renderer && g_renderer->window ? g_renderer->window->h : 0;
	}

	const Uint8 *BackbufferRGBA()
	{
		if (!g_renderer)
			return nullptr;
		return (const Uint8 *)g_renderer->backbuffer.data();
	}

	void StageInterfaceImage(const Uint8 *rgba, int w, int h)
	{
		if (!rgba || w <= 0 || h <= 0)
			return;
		g_staged_rgba.assign(rgba, rgba + (size_t)w * h * 4);
		g_staged_w = w;
		g_staged_h = h;
	}

	bool HasStagedInterfaceImage()
	{
		return !g_staged_rgba.empty();
	}

	int StagedInterfaceWidth()
	{
		return g_staged_w;
	}

	int StagedInterfaceHeight()
	{
		return g_staged_h;
	}

	const Uint8 *StagedInterfacePixels()
	{
		return g_staged_rgba.empty() ? nullptr : g_staged_rgba.data();
	}

	int UpdateInterfaceTexture(const Uint8 *rgba, int w, int h)
	{
		if (!rgba || w <= 0 || h <= 0)
			return -1;

		StageInterfaceImage(rgba, w, h);

		SDL_Texture *target = g_interface_texture;
		if (!target)
			for (SDL_Texture *texture : g_textures_live)
				if (!texture->is_target && texture->w == w && texture->h == h)
				{
					target = texture;
					break;
				}

		if (!target)
			return 0;

		/* The front-end is allowed to hand the atlas over after emu_web_init()
		 * has already run, so the texture may still be a placeholder. */
		if (target->w != w || target->h != h)
		{
			target->w = w;
			target->h = h;
			target->px.assign((size_t)w * h, 0);
		}

		SDL_Rect rect{0, 0, w, h};
		return SDL_UpdateTexture(target, &rect, rgba, w * 4);
	}

	void Shutdown()
	{
		for (SDL_Texture *texture : g_textures_live)
			delete texture;
		g_textures_live.clear();
		for (SDL_Texture *texture : g_texture_pool)
			delete texture;
		g_texture_pool.clear();

		g_interface_texture = nullptr;
		delete g_renderer;
		g_renderer = nullptr;
		delete g_window;
		g_window = nullptr;
		g_staged_rgba.clear();
		g_staged_w = g_staged_h = 0;
	}
}
