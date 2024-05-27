resource "nomad_job" "ipc" {
  jobspec          = file("${path.module}/job.nomad.hcl")
  purge_on_destroy = true
  detach           = false
  rerun_if_dead    = true

  hcl2 {
    vars = {
      workspace = terraform.workspace
    }
  }
}
