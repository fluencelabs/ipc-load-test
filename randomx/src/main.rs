use chrono::{Local, Utc};
use crossbeam::channel::{unbounded, Receiver, Sender};
use log::*;
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::thread;
use std::time::Duration;

mod hashers;
mod pid_handler;
mod pow;
mod request;
mod puzzle;

const PID_PATH: &str = "./pid.json";
const MAIN_LOOP_SLEEP: u32 = 500; // in millis
const WORKER_THREADS: u32 = 2;
const JS_TO_RUST_PIPE: &str = "/tmp/js_to_rust_pipe";
const RUST_TO_JS_PIPE: &str = "/tmp/rust_to_js_pipe";

fn setup_logging() {
    env_logger::Builder::new()
        .target(env_logger::Target::Stdout)
        .filter(None, LevelFilter::Debug)
        .format(|buf, record| {
            writeln!(
                buf,
                "[{} {} {}:{}] {}",
                Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.file().unwrap_or("unknown"),
                record.line().unwrap_or(0),
                record.args()
            )
        })
        .init();
}

fn val_to_u8vec(jval: &Value) -> Vec<u8> {
    hex::decode(jval.as_str().unwrap().trim_start_matches("0x")).unwrap()
}

fn str_to_u8vec(s: &str) -> Vec<u8> {
    hex::decode(s.trim_start_matches("0x")).unwrap()
}

fn u8vec_to_str(v: &[u8]) -> String {
    format!("0x{}", hex::encode(v))
}

fn main() {
    // let g_nonce =
    //     str_to_u8vec("0x0101010101010101010101010101010101010101010101010101010101010101");
    // let unit_id =
    //     str_to_u8vec("0x0202020202020202020202020202020202020202020202020202020202020202");
    // let mut context_raw = vec![];
    // context_raw.extend(g_nonce);
    // context_raw.extend(unit_id);
    // let context_hash = hashers::keccak_hasher(&context_raw);
    // println!("Keccak: {}", u8vec_to_str(&context_hash));
    // let context = Arc::new(Context::new(&context_hash, true));
    // let hasher = Hasher::new(context);
    // let nonce = str_to_u8vec("0x0303030303030303030303030303030303030303030303030303030303030303");

    // let hash = hasher.hash(&nonce);
    // println!("Hash: {}", u8vec_to_str(&hash.as_ref()));

    // handle pid file
    pid_handler::rm_pid();
    pid_handler::write_pid();

    setup_logging();

    //ctrlc and limited sigterm catcher
    let (crlc_tx, crlc_rx) = unbounded();
    ctrlc::set_handler(move || crlc_tx.send(()).expect("Could not send signal on channel."))
        .expect("Error setting Ctrl-C handler");
    log::info!("crlc channel is up.");

    let js_to_rust_pipe = OpenOptions::new().read(true).open(JS_TO_RUST_PIPE).unwrap();
    let mut rust_to_js_pipe = OpenOptions::new()
        .write(true)
        .create(true)
        .open(RUST_TO_JS_PIPE)
        .unwrap();
    let reader = BufReader::new(js_to_rust_pipe);
    let (requests_tx, requests_rx): (Sender<request::Request>, Receiver<request::Request>) = unbounded();

    let _reader_thread = thread::spawn(move || {
        for line in reader.lines() {
            let line = line.unwrap();
            let req: request::Request = serde_json::from_str(&line).expect("Failed to parse Request");
            requests_tx.send(req).unwrap();
        }
    });
    log::info!("communication is up.");

    log::info!("entering main control loop.");
    loop {
        while let Ok(req) = requests_rx.try_recv() {
            log::info!("received request: {:?}", req);
            let solutions = pow::randomx_gen(&req.globalNonce, &req.unitId, req.n);   
            log::info!("solutions: {:?}", solutions);
            for sol in solutions {
                let sol_str = serde_json::to_string(&sol).unwrap();
                rust_to_js_pipe.write_all(sol_str.as_bytes()).unwrap();
                rust_to_js_pipe.write_all(b"\n").unwrap();
            }
        }

        if let Ok(_) = crlc_rx.try_recv() {
            log::info!("received sigterm signal ... shutting down.");
            break;
        }

        thread::sleep(Duration::from_millis(MAIN_LOOP_SLEEP as u64));
    }

    // teardown -- might be blocking for SIGTERM
    let timer_start = Utc::now().timestamp_millis();
    let max_shutdown_duration: i32 = 15 * 1_000; // 15 seconds to clean things up

    while Utc::now().timestamp_millis() - timer_start < (max_shutdown_duration as i64) {
        // all threads exited ? log::info!("threads have exited")

        // all channels empty ? log::info!("channels are empty")

        thread::sleep(Duration::from_millis(100));
    }
    log::info!("done with interrupt catcher.");
    // TODO: stop reader thread gracefully
    _reader_thread.join().unwrap();
    log::info!("done and done. exiting main.");
}
