/**
 * Discord UI Hybrid for SillyTavern
 * Keeps SillyTavern's native data/actions and adds a Discord-like master-detail UI.
 * No polling and no chat MutationObserver: only panel classes, preset options and
 * SillyTavern events are observed.
 */

const ROOT_CLASS = 'cw-dx';
const state = {
    started: false,
    panelFrame: 0,
    selectedChid: null,
    characterRefreshTimer: 0,
    characterPanelOpen: false,
    promptLocked: null,
    promptLockTimer: 0,
};

const PANELS = {
    preset: { panelId: 'left-nav-panel', iconId: 'leftNavDrawerIcon' },
    character: { panelId: 'right-nav-panel', iconId: 'rightNavDrawerIcon' },
    api: { panelId: 'rm_api_block', iconId: 'API-status-top' },
};

function q(id) {
    return document.getElementById(id);
}

function context() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function debounceFrame(fn) {
    cancelAnimationFrame(state.panelFrame);
    state.panelFrame = requestAnimationFrame(() => {
        state.panelFrame = 0;
        fn();
    });
}

function init() {
    if (state.started) return;
    state.started = true;

    let attempts = 0;
    const boot = () => {
        if (!q('left-nav-panel') || !q('right-nav-panel') || !context()) {
            if (attempts++ < 100) setTimeout(boot, 50);
            return;
        }
        start();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
}

function start() {
    document.body.classList.add(ROOT_CLASS);

    for (const { panelId, iconId } of Object.values(PANELS)) {
        const panel = q(panelId);
        if (panel) addCloseButton(panel, iconId);
    }

    observePanels();
    bindGlobalHandlers();
    bindSillyTavernEvents();
    syncPanels();

    console.info('[Discord UI Hybrid] ready');
}

function addCloseButton(panel, iconId) {
    if (!panel || panel.querySelector(':scope > .cw-dx-panel-close')) return;
    const close = make('button', 'cw-dx-panel-close', '×');
    close.type = 'button';
    close.title = 'Close panel';
    close.setAttribute('aria-label', 'Close panel');
    close.addEventListener('click', () => q(iconId)?.click());
    panel.append(close);
}

function observePanels() {
    const observer = new MutationObserver(() => debounceFrame(syncPanels));
    for (const { panelId } of Object.values(PANELS)) {
        const panel = q(panelId);
        if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }
}

function isOpen(panelId) {
    return q(panelId)?.classList.contains('openDrawer') ?? false;
}

function syncPanels() {
    const presetOpen = isOpen(PANELS.preset.panelId);
    const characterOpen = isOpen(PANELS.character.panelId);
    const apiOpen = isOpen(PANELS.api.panelId);

    document.body.classList.toggle('cw-dx-panel-preset', presetOpen);
    document.body.classList.toggle('cw-dx-panel-character', characterOpen);
    document.body.classList.toggle('cw-dx-panel-api', apiOpen);

    if (presetOpen) {
        refreshPresetUI();
    }

    if (apiOpen) {
        refreshApiUI();
    }

    if (characterOpen) {
        if (!state.characterPanelOpen) state.selectedChid = null;
        refreshCharacterPanel();
    } else {
        document.body.classList.remove('cw-dx-char-browse', 'cw-dx-editing');
    }
    state.characterPanelOpen = characterOpen;
}

function bindGlobalHandlers() {
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (isOpen(PANELS.preset.panelId)) q(PANELS.preset.iconId)?.click();
        else if (isOpen(PANELS.character.panelId)) q(PANELS.character.iconId)?.click();
    });

    const leaveBrowse = () => document.body.classList.remove('cw-dx-char-browse', 'cw-dx-editing');
    for (const id of ['rm_button_create', 'rm_button_group_chats', 'character_import_button', 'external_import_button']) {
        q(id)?.addEventListener('click', leaveBrowse);
    }

    const enterBrowse = () => {
        setTimeout(() => {
            if (!isOpen(PANELS.character.panelId)) return;
            const list = q('rm_characters_block');
            if (list && getComputedStyle(list).display !== 'none') {
                document.body.classList.add('cw-dx-char-browse');
                ensureCharacterInfo();
                refreshCharacterPanel();
            }
        }, 80);
    };
    q('rm_button_characters')?.addEventListener('click', enterBrowse);
    q('rm_button_back')?.addEventListener('click', enterBrowse);

    q('main_api')?.addEventListener('change', syncPresetToolsVisibility);

    q('right-nav-panel')?.addEventListener('click', onCharacterCardClick, true);
}

function onCharacterCardClick(event) {
    if (!document.body.classList.contains('cw-dx-char-browse')) return;
    if (q('rm_print_characters_block')?.classList.contains('bulk_select')) return;

    const card = event.target.closest?.('#rm_print_characters_block .character_select');
    if (!card) return;
    if (event.target.closest?.('input, button, label, .menu_button, .avatar_container_states, .for_checkbox, .del_checkbox')) return;

    const chid = Number(card.dataset.chid);
    if (!Number.isInteger(chid)) return;

    event.preventDefault();
    event.stopPropagation();
    state.selectedChid = chid;
    highlightSelectedCard(chid);
    renderCharacterInfo(chid);
}

function bindSillyTavernEvents() {
    const ctx = context();
    if (!ctx?.eventSource || !ctx?.eventTypes) return;

    const types = ctx.eventTypes;
    const on = (name, callback) => {
        if (types[name]) ctx.eventSource.on(types[name], callback);
    };

    for (const name of ['CHATCOMPLETION_SOURCE_CHANGED', 'SETTINGS_LOADED_AFTER']) {
        on(name, schedulePresetToolsSync);
    }

    for (const name of ['PRESET_CHANGED', 'OAI_PRESET_CHANGED_AFTER', 'CHAT_CHANGED']) {
        on(name, schedulePromptLockEnsure);
    }

    for (const name of ['CHARACTER_PAGE_LOADED', 'CHARACTER_EDITED', 'CHARACTER_DELETED', 'CHARACTER_DUPLICATED', 'CHARACTER_RENAMED', 'CHAT_CHANGED']) {
        on(name, scheduleCharacterRefresh);
    }
}

function schedulePresetToolsSync() {
    setTimeout(() => {
        if (isOpen(PANELS.preset.panelId)) {
            ensurePresetTools();
            syncPresetToolsVisibility();
        }
    }, 60);
}

function scheduleCharacterRefresh() {
    clearTimeout(state.characterRefreshTimer);
    state.characterRefreshTimer = setTimeout(() => {
        if (isOpen(PANELS.character.panelId)) refreshCharacterPanel();
    }, 80);
}

/* --------------------------------------------------------------------------
 * Preset panel
 * ----------------------------------------------------------------------- */

function refreshPresetUI() {
    if (!isOpen(PANELS.preset.panelId)) return;
    ensurePresetTools();
    syncPresetToolsVisibility();
    ensurePromptLock();
}

function ensurePresetTools() {
    const config = q('ai_response_configuration');
    if (!config) return;

    // Clean up artifacts from the earlier preset-directory version.
    q('cw-dx-preset-directory')?.remove();
    q('cw-dx-preset-summary')?.remove();
    for (const select of document.querySelectorAll('select.cw-dx-native-preset-select')) {
        select.classList.remove('cw-dx-native-preset-select');
    }

    let tools = q('cw-dx-preset-left');
    if (!tools) {
        tools = make('section', 'cw-dx-preset-left');
        tools.id = 'cw-dx-preset-left';

        const head = make('div', 'cw-dx-preset-left-head');
        head.append(
            make('span', 'cw-dx-preset-left-kicker', 'PROMPT TOOLS'),
            make('span', 'cw-dx-preset-left-title', '偏置与提示词'),
        );
        tools.append(head);
        config.prepend(tools);
    }

    let right = q('cw-dx-preset-right');
    if (!right) {
        right = make('section', 'cw-dx-preset-right');
        right.id = 'cw-dx-preset-right';
        config.append(right);
    }

    for (const child of [...config.children]) {
        if (child === tools || child === right) continue;
        if (child.parentElement !== right) right.append(child);
    }

    const biasBlock = q('logit_bias_openai')?.closest('.range-block');
    const promptBlock = q('completion_prompt_manager')?.closest('.range-block');

    if (biasBlock) tools.append(biasBlock);
    if (promptBlock) tools.append(promptBlock);
}

function syncPresetToolsVisibility() {
    const tools = q('cw-dx-preset-left');
    if (!tools) return;
    const api = q('main_api')?.value;
    tools.hidden = Boolean(api && api !== 'openai');
    document.body.classList.toggle('cw-dx-preset-tools-hidden', tools.hidden);
}

function readPromptLockPreference() {
    if (state.promptLocked !== null) return state.promptLocked;

    let stored = null;
    try {
        stored = localStorage.getItem('cw-dx-prompt-lock');
    } catch {
        // Storage can be unavailable in restricted browser contexts.
    }

    if (stored === '1' || stored === '0') {
        state.promptLocked = stored === '1';
    } else {
        state.promptLocked = Boolean(
            window.matchMedia?.('(pointer: coarse)')?.matches ||
            (navigator.maxTouchPoints ?? 0) > 0,
        );
    }

    return state.promptLocked;
}

function ensurePromptLock() {
    const manager = q('completion_prompt_manager');
    const footer = manager?.querySelector('.completion_prompt_manager_footer');
    const chain = footer?.querySelector('a.menu_button.fa-chain');
    if (!footer || !chain) return;

    let lock = q('cw-dx-prompt-lock');
    if (!lock || lock.parentElement !== footer) {
        lock?.remove();
        lock = document.createElement('a');
        lock.id = 'cw-dx-prompt-lock';
        lock.className = 'menu_button fa-solid fa-fw interactable cw-dx-prompt-lock';
        lock.setAttribute('role', 'button');
        lock.tabIndex = 0;

        const toggle = (event) => {
            event.preventDefault();
            state.promptLocked = !readPromptLockPreference();
            try {
                localStorage.setItem('cw-dx-prompt-lock', state.promptLocked ? '1' : '0');
            } catch {
                // Keep the in-memory preference if storage is unavailable.
            }
            applyPromptLock();
        };

        lock.addEventListener('click', toggle);
        lock.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') toggle(event);
        });
        chain.insertAdjacentElement('afterend', lock);
    }

    applyPromptLock();
}

function applyPromptLock() {
    const manager = q('completion_prompt_manager');
    const list = q('completion_prompt_manager_list');
    const lock = q('cw-dx-prompt-lock');
    if (!manager || !lock) return;

    const locked = readPromptLockPreference();
    manager.classList.toggle('cw-dx-prompt-locked', locked);
    lock.classList.toggle('fa-lock', locked);
    lock.classList.toggle('fa-lock-open', !locked);
    lock.classList.toggle('is-locked', locked);
    lock.title = locked ? '解锁提示词排序（允许拖动）' : '锁定提示词排序（防止误拖动）';
    lock.setAttribute('aria-label', lock.title);
    lock.setAttribute('aria-pressed', String(locked));

    const $ = globalThis.jQuery;
    if ($ && list) {
        try {
            const sortable = $(list);
            if (sortable.data('ui-sortable')) {
                sortable.sortable(locked ? 'disable' : 'enable');
            }
        } catch (error) {
            console.debug('[Discord UI Hybrid] Prompt sortable lock not applied', error);
        }
    }
}

function schedulePromptLockEnsure() {
    clearTimeout(state.promptLockTimer);
    state.promptLockTimer = setTimeout(() => {
        if (isOpen(PANELS.preset.panelId)) ensurePromptLock();
    }, 80);
}

/* --------------------------------------------------------------------------
 * API Connections panel: settings on the left, Regex extension on the right
 * ----------------------------------------------------------------------- */

function refreshApiUI() {
    if (!isOpen(PANELS.api.panelId)) return;
    ensureApiLayout();
}

function ensureApiLayout() {
    const panel = q('rm_api_block');
    if (!panel) return;

    let layout = q('cw-dx-api-layout');
    if (!layout) {
        layout = make('div', 'cw-dx-api-layout');
        layout.id = 'cw-dx-api-layout';

        const left = make('section', 'cw-dx-api-left');
        left.id = 'cw-dx-api-left';

        const right = make('section', 'cw-dx-api-right');
        right.id = 'cw-dx-api-right';

        layout.append(left, right);
        panel.append(layout);
    }

    const left = q('cw-dx-api-left');
    const right = q('cw-dx-api-right');
    if (!left || !right) return;

    for (const child of [...panel.children]) {
        if (child === layout || child.classList.contains('cw-dx-panel-close')) continue;
        if (child.parentElement !== left) left.append(child);
    }

    const regex = q('regex_container');
    if (regex && regex.parentElement !== right) {
        right.append(regex);

        const content = regex.querySelector('.inline-drawer-content');
        const toggle = regex.querySelector('.inline-drawer-toggle');
        if (content && toggle && getComputedStyle(content).display === 'none') {
            toggle.click();
        }
    }
}

/* --------------------------------------------------------------------------
 * Character panel
 * ----------------------------------------------------------------------- */

function ensureCharacterInfo() {
    const host = q('right-nav-panel')?.querySelector('.scrollableInner');
    if (!host) return null;

    let info = q('cw-dx-char-info');
    if (!info) {
        info = make('aside', 'cw-dx-char-info');
        info.id = 'cw-dx-char-info';
        info.setAttribute('aria-live', 'polite');
        host.append(info);
    } else if (info.parentElement !== host) {
        host.append(info);
    }
    return info;
}

function refreshCharacterPanel() {
    if (!isOpen(PANELS.character.panelId)) return;
    ensureCharacterInfo();
    placeCharacterPin();

    const list = q('rm_characters_block');
    const listVisible = list && getComputedStyle(list).display !== 'none';
    if (listVisible) document.body.classList.add('cw-dx-char-browse');

    if (!document.body.classList.contains('cw-dx-char-browse')) return;

    const ctx = context();
    const characters = ctx?.characters ?? [];
    if (!Number.isInteger(state.selectedChid) || !characters[state.selectedChid]) {
        state.selectedChid = getInitialCharacterId();
    }

    highlightSelectedCard(state.selectedChid);
    renderCharacterInfo(state.selectedChid);
}

function placeCharacterPin() {
    const pin = q('rm_button_panel_pin_div');
    const pagination = q('rm_print_characters_pagination');
    const bulkEdit = q('bulkEditButton');
    if (!pin || !pagination || !bulkEdit) return;

    if (pin.parentElement !== pagination || pin.previousElementSibling !== bulkEdit) {
        pagination.insertBefore(pin, bulkEdit.nextSibling);
    }
}

function getInitialCharacterId() {
    const ctx = context();
    const characters = ctx?.characters ?? [];
    const current = Number(ctx?.characterId);
    if (Number.isInteger(current) && characters[current]) return current;

    const card = document.querySelector('#rm_print_characters_block .character_select[data-chid]');
    const fromCard = Number(card?.dataset?.chid);
    return Number.isInteger(fromCard) ? fromCard : null;
}

function highlightSelectedCard(chid) {
    for (const card of document.querySelectorAll('#rm_print_characters_block .character_select')) {
        card.classList.toggle('cw-dx-selected', Number(card.dataset.chid) === chid);
    }
}

function renderCharacterInfo(chid) {
    const info = ensureCharacterInfo();
    if (!info) return;

    const ctx = context();
    const character = Number.isInteger(chid) ? ctx?.characters?.[chid] : null;
    info.replaceChildren();

    if (!character) {
        info.append(
            make('div', 'cw-dx-char-empty-title', '选择一个角色'),
            make('p', 'cw-dx-char-empty-text', '从左侧角色列表选择一张卡，这里会显示它的只读信息。'),
        );
        return;
    }

    const avatar = ctx?.getThumbnailUrl?.('avatar', character.avatar) || 'img/ai4.png';
    const header = make('div', 'cw-dx-char-header');
    const image = document.createElement('img');
    image.className = 'cw-dx-char-avatar';
    image.src = avatar;
    image.alt = character.name || 'Character avatar';
    image.loading = 'lazy';

    const titleBlock = make('div', 'cw-dx-char-title-block');
    titleBlock.append(
        make('div', 'cw-dx-char-kicker', 'CHARACTER'),
        make('h2', 'cw-dx-char-name', character.name || 'Unnamed character'),
        make('div', 'cw-dx-char-meta', characterMeta(character)),
    );

    const chatButton = make('button', 'cw-dx-char-chat', '进入聊天');
    chatButton.type = 'button';
    chatButton.addEventListener('click', () => openCharacterChat(chid));

    header.append(image, titleBlock, chatButton);
    info.append(header);

    const tags = normalizeTags(character.data?.tags ?? character.tags);
    if (tags.length) {
        const tagRow = make('div', 'cw-dx-char-tags');
        for (const tag of tags) tagRow.append(make('span', 'cw-dx-char-tag', tag));
        info.append(tagRow);
    }

    appendTextSection(info, '描述', character.description);
    appendTextSection(info, '首条消息', character.first_mes, true);
    appendTextSection(info, '创建者备注', character.data?.creator_notes ?? character.creatorcomment, true);
    appendTextSection(info, '性格', character.personality);
    appendTextSection(info, '场景', character.scenario);
}

function characterMeta(character) {
    const bits = [];
    const creator = character.data?.creator ?? character.creator;
    const version = character.data?.character_version ?? character.character_version;
    if (creator) bits.push(creator);
    if (version) bits.push(`v${version}`);
    return bits.join(' · ') || '角色卡信息';
}

function normalizeTags(tags) {
    if (Array.isArray(tags)) return tags.filter(Boolean).map((tag) => String(tag));
    if (typeof tags === 'string') return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    return [];
}

function appendTextSection(parent, title, value, collapsible = false) {
    const text = String(value ?? '').trim();
    if (!text) return;

    if (collapsible) {
        const details = make('details', 'cw-dx-char-section cw-dx-char-details');
        details.append(
            make('summary', 'cw-dx-char-section-title', title),
            make('div', 'cw-dx-char-text', text),
        );
        parent.append(details);
        return;
    }

    const section = make('section', 'cw-dx-char-section');
    section.append(
        make('h3', 'cw-dx-char-section-title', title),
        make('div', 'cw-dx-char-text', text),
    );
    parent.append(section);
}

async function openCharacterChat(chid) {
    const current = Number(context()?.characterId);
    if (Number.isInteger(current) && current === chid) {
        if (isOpen(PANELS.character.panelId)) q(PANELS.character.iconId)?.click();
        return;
    }

    try {
        const script = await import(new URL('../../../../script.js', import.meta.url).href);
        await script.selectCharacterById(chid);
        setTimeout(() => {
            if (isOpen(PANELS.character.panelId)) q(PANELS.character.iconId)?.click();
        }, 100);
    } catch (error) {
        console.error('[Discord UI Hybrid] Could not open character', error);
    }
}

init();
