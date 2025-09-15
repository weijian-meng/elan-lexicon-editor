import os
import threading
import time


def bind_close_handlers(window, api):
    """Bind a close handler that prompts to save unsaved changes via JS modal or native dialogs.

    window: webview window
    api: instance with `_modified` flag that JS updates
    """

    def close_app():
        print("Destroying window...")
        try:
            window.hide()
        except Exception:
            pass

        def delayed_destroy():
            time.sleep(0.1)
            try:
                window.destroy()
                print("Window destroyed successfully")
            except Exception as e:
                print(f"Error destroying window: {e}")
                try:
                    print("Force exiting...")
                    os._exit(0)
                except Exception as e2:
                    print(f"Error with force exit: {e2}")

        threading.Thread(target=delayed_destroy, daemon=True).start()

    def on_closing():
        print(f"Close event triggered! Modified state: {getattr(api, '_modified', False)}")
        if not getattr(api, '_modified', False):
            print("No changes detected, allowing close")
            return True

        def _prompt_and_handle():
            try:
                print("Showing close confirmation dialog...")

                def _on_save_done(result=None):
                    try:
                        saved = bool(result)
                        print(f"Save result: {saved}")
                    except Exception:
                        saved = False
                    if saved:
                        print("Save successful, closing window")
                        api._modified = False
                        close_app()
                    else:
                        print("Save failed or cancelled, staying open")

                def _attempt_async_save():
                    try:
                        print("Calling JavaScript save function...")
                        window.evaluate_js(
                            'typeof window.__saveNow === "function" ? window.__saveNow() : Promise.resolve(false)',
                            _on_save_done,
                        )
                    except Exception as e:
                        print(f"Error calling save function: {e}")

                # Try JS modal flow first
                try:
                    print("Attempting JavaScript modal dialog...")
                    window.evaluate_js('showCloseConfirmDialog()')

                    result = None
                    timeout = 30
                    start_time = time.time()
                    while time.time() - start_time < timeout:
                        dialog_shown = window.evaluate_js('isCloseDialogShown()')
                        if not dialog_shown:
                            result = window.evaluate_js('getCloseDialogResult()')
                            break
                        time.sleep(0.1)

                    print(f"JavaScript dialog result: {result}")

                    if str(result) == 'save':
                        print("User chose to save - attempting to save and close")
                        _attempt_async_save()
                    elif str(result) == 'dont_save':
                        print("User chose to close without saving")
                        api._modified = False
                        close_app()
                    else:
                        print("User cancelled - staying open")

                except Exception as js_error:
                    print(f"JavaScript dialog failed: {js_error}, falling back to native dialogs")

                    save_choice = window.create_confirmation_dialog(
                        'Unsaved Changes',
                        'You have unsaved changes. Do you want to save before closing?',
                    )
                    print(f"User choice for save: {save_choice}")

                    if save_choice:
                        print("User chose to save - attempting to save and close")
                        _attempt_async_save()
                    else:
                        print("User chose not to save - asking for confirmation to close without saving")
                        really_close = window.create_confirmation_dialog(
                            'Confirm Close',
                            'Are you sure you want to close without saving? Your changes will be lost.',
                        )
                        print(f"User choice for close without save: {really_close}")
                        if really_close:
                            print("User confirmed close without save")
                            api._modified = False
                            close_app()
                        else:
                            print("User cancelled - staying open")
            except Exception as e:
                print(f"Error in close prompt: {e}")
                api._modified = False
                close_app()

        threading.Thread(target=_prompt_and_handle, daemon=True).start()
        return False

    try:
        print("Attempting to bind close event...")
        if hasattr(window, 'events') and hasattr(window.events, 'closing'):
            window.events.closing += on_closing
            print("Successfully bound close event!")
        else:
            print("Window events or closing event not available")
    except Exception as e:
        print(f"Error binding close event: {e}")
        try:
            window.confirm_close = True
            print("Set confirm_close to True as fallback")
        except Exception as e2:
            print(f"Could not set confirm_close: {e2}")

