use crate::PID_PATH;
use std::fs::File;
use std::fs::remove_file;
use std::fs::metadata;

pub fn rm_pid() -> bool {
    if metadata(PID_PATH).is_err() {
        return true;
    }
    match remove_file(PID_PATH) {
        Ok(_) => true,
        Err(_) => false,
    }
}

pub fn write_pid() -> bool {
    let mut writer = File::create(PID_PATH).unwrap();

    let pid = std::process::id();
    match serde_json::to_writer(&mut writer, &pid) {
        Ok(_) => true,
        Err(_) => false,
    }

}