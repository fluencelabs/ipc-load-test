#![feature(lazy_cell)]
#![feature(file_create_new)]
use chrono::{Local, Utc};
use crossbeam::channel::{unbounded, Receiver, Sender};
use fluence_keypair::KeyPair;
use log::*;
use serde_json::Value;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, LazyLock};
use std::thread;
use std::time::Duration;

mod hashers;
mod pid_handler;
mod pow;
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

struct Worker {
    thread: thread::JoinHandle<()>,
    rx: Receiver<puzzle::PuzzleSolution>,
    tx: Sender<pow::Event>,
}

fn val_to_u8vec(jval: &Value) -> Vec<u8> {
    hex::decode(jval.as_str().unwrap().trim_start_matches("0x")).unwrap()
}

fn main() {
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
    let (updates_tx, updates_rx): (Sender<Value>, Receiver<Value>) = unbounded();

    let _reader_thread = thread::spawn(move || {
        for line in reader.lines() {
            let line = line.unwrap();
            let json: Value = serde_json::from_str(&line).expect("Failed to parse JSON");
            updates_tx.send(json).unwrap();
        }
    });
    log::info!("communication is up.");

    let mut workers: Vec<Worker> = vec![];
    for _ in 0..WORKER_THREADS {
        let (etx, erx): (Sender<pow::Event>, Receiver<pow::Event>) = unbounded();
        let (ptx, prx): (
            Sender<puzzle::PuzzleSolution>,
            Receiver<puzzle::PuzzleSolution>,
        ) = unbounded();

        let thread = pow::randomx_instance(erx, ptx);
        workers.push(Worker {
            thread,
            rx: prx,
            tx: etx,
        });
    }
    log::info!("workers are up.");

    let send_event = |event: pow::Event| {
        for worker in &workers {
            worker.tx.send(event.clone()).unwrap();
        }
    };

    //main monitoring loop -- trying to preserve threads for randomx
    log::info!("entering main control loop.");
    loop {
        while let Ok(update) = updates_rx.try_recv() {
            log::info!("Received update: {:?}", update);

            if let Some(g_nonce) = update.get("globalNonce") {
                send_event(pow::Event::GNonce(val_to_u8vec(g_nonce)));
            }

            if let Some(unit_id) = update.get("unitId") {
                send_event(pow::Event::UnitId(val_to_u8vec(unit_id)));
            }

            if let Some(difficulty) = update.get("difficulty") {
                send_event(pow::Event::Difficulty(val_to_u8vec(difficulty)));
            }

            if let Some(stop) = update.get("stop") {
                if stop.as_bool().unwrap() {
                    send_event(pow::Event::Stop);
                }
            }
        }

        for worker in &workers {
            while let Ok(solution) = worker.rx.try_recv() {
                log::info!("Received solution: {:?}", solution);

                let json = serde_json::to_string(&solution).unwrap();
                rust_to_js_pipe.write_all((json + "\n").as_bytes()).unwrap();
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
    // finally join
    for worker in workers {
        worker.thread.join().unwrap();
    }
    // TODO: stop reader thread gracefully
    //_reader_thread.join().unwrap();
    log::info!("done and done. exiting main.");
}
